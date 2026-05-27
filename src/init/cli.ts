#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stringify as yamlStringify } from "yaml";
import { detectPacks } from "../packs/index.js";
import { readRepoSignals } from "../mcp-server/signals.js";
import { describeStacks, DetectedStack } from "../assessment/stackDetect.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, "..", "..");
const SKILL_SRC = join(PACKAGE_ROOT, "skills", "pickaxis");
const COMMANDS_SRC = join(SKILL_SRC, "commands");

async function main() {
  const repoRoot = resolve(process.cwd());
  console.log(`Initializing pickaxis in ${repoRoot}`);

  const signals = await readRepoSignals(repoRoot);
  const stacks = signals.stacks ?? [];
  console.log(
    `  detected stacks: ${describeStacks({ stacks, primaryLanguage: signals.primaryLanguage, languageCensus: {} })}`,
  );
  const packs = detectPacks(signals);
  console.log(`  detected packs: ${packs.map((p) => p.id).join(", ") || "(none)"}`);

  await writeConfig(repoRoot, packs.map((p) => p.id), stacks);
  console.log("  wrote pickaxis.yaml");

  const mcpSpec = await resolveMcpSpec();
  await registerMcpServer(repoRoot, mcpSpec);
  console.log(`  registered MCP server in .mcp.json (using "${mcpSpec}")`);

  await dropSkillBundle(repoRoot);
  console.log("  installed skill to .claude/skills/pickaxis/");

  const cmdCount = await dropSlashCommands(repoRoot);
  console.log(`  installed ${cmdCount} slash commands to .claude/commands/`);

  console.log("");
  console.log("Done. Restart Claude Code, then run /px-assess to take the initial assessment.");
}

/**
 * Decide what string to pass to `npx -y <SPEC> --mcp` so the MCP server can be launched later.
 *
 * Priority:
 *   1. Explicit --ref <spec> flag from the command line.
 *   2. Auto-detect by walking up the directory tree from PACKAGE_ROOT looking for the closest
 *      parent package.json that lists "pickaxis" in its dependencies. If the dep value points
 *      at a git URL, that's the spec. This catches both `npm install github:...` (which writes
 *      the spec into the project's package.json) and `npx github:...` (which writes a synthetic
 *      package.json at the npx cache root).
 *   3. Legacy: try this package's own package.json `_from` field. npm < 10 wrote it; npm 10+ doesn't.
 *   4. Fallback to the bare package name (assumes a future npm publish).
 */
async function resolveMcpSpec(): Promise<string> {
  const refFlag = getRefFromArgv();
  if (refFlag) return refFlag;

  // (2) walk up looking for a parent package.json that names us as a git dep
  const fromParent = await findGitSpecInParents(PACKAGE_ROOT);
  if (fromParent) return fromParent;

  // (3) legacy: _from on the installed package.json (npm < 10)
  try {
    const ownPackageJson = JSON.parse(
      await fs.readFile(join(PACKAGE_ROOT, "package.json"), "utf8"),
    );
    const from = ownPackageJson._from;
    if (typeof from === "string" && looksLikeGitSpec(from)) return from;
  } catch {
    // ignore
  }

  return "pickaxis";
}

function looksLikeGitSpec(spec: string): boolean {
  return (
    spec.startsWith("github:") ||
    spec.startsWith("gitlab:") ||
    spec.startsWith("bitbucket:") ||
    spec.startsWith("git+") ||
    spec.startsWith("git://") ||
    spec.endsWith(".git") ||
    spec.endsWith(".tgz") ||
    spec.startsWith("https://github.com/") ||
    spec.startsWith("https://gitlab.com/")
  );
}

async function findGitSpecInParents(startDir: string): Promise<string | undefined> {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
    const pkgPath = join(dir, "package.json");
    try {
      const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
      const deps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
        ...(pkg.optionalDependencies ?? {}),
      };
      const spec = deps.pickaxis;
      if (typeof spec === "string" && looksLikeGitSpec(spec)) return spec;
    } catch {
      // file missing or unreadable — keep walking
    }
  }
  return undefined;
}

function getRefFromArgv(): string | undefined {
  const argv = process.argv;
  const idx = argv.indexOf("--ref");
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
  const eqArg = argv.find((a) => a.startsWith("--ref="));
  if (eqArg) return eqArg.slice("--ref=".length);
  return undefined;
}

async function writeConfig(
  repoRoot: string,
  packIds: string[],
  stacks: DetectedStack[],
): Promise<void> {
  const configPath = join(repoRoot, "pickaxis.yaml");
  if (await exists(configPath)) {
    console.log("  pickaxis.yaml already exists — leaving it alone");
    return;
  }
  const config = {
    packs: packIds,
    detectedStacks: stacks.map((s) => (s.root === "." ? s.id : `${s.id}@${s.root}`)),
    assess: {
      reassessAfterDays: 30,
    },
    privacy: {
      sendPromptsToHostAi: true,
      logFileTouches: true,
    },
    tools: {},
  };
  await fs.writeFile(
    configPath,
    `# pickaxis configuration\n# Profile data lives in ~/.pickaxis/ and is NEVER committed.\n# This file IS committed — it shapes the assessment for the whole team.\n\n${yamlStringify(config)}`,
    "utf8",
  );
}

// MCP servers are configured in .mcp.json at the project root — the documented,
// committable, project-scoped location. (mcpServers in .claude/settings.json is
// ignored by Claude Code.) No absolute PICKAXIS_REPO_ROOT is written here so the
// file stays portable when committed; the server finds the root via pickaxis.yaml.
async function registerMcpServer(repoRoot: string, mcpSpec: string): Promise<void> {
  const mcpPath = join(repoRoot, ".mcp.json");

  let config: Record<string, unknown> = {};
  if (await exists(mcpPath)) {
    try {
      config = JSON.parse(await fs.readFile(mcpPath, "utf8"));
    } catch {
      console.warn("  .mcp.json exists but is not valid JSON — skipping merge");
      return;
    }
  }

  const mcpServers =
    (config.mcpServers as Record<string, unknown> | undefined) ?? {};
  mcpServers.pickaxis = {
    command: "npx",
    args: ["-y", mcpSpec, "--mcp"],
  };
  config.mcpServers = mcpServers;

  await fs.writeFile(mcpPath, JSON.stringify(config, null, 2) + "\n", "utf8");
}

// The SKILL.md drives Claude's proactive behavior — it lives under .claude/skills/.
async function dropSkillBundle(repoRoot: string): Promise<void> {
  const dest = join(repoRoot, ".claude", "skills", "pickaxis");
  await fs.mkdir(dest, { recursive: true });
  await fs.copyFile(join(SKILL_SRC, "SKILL.md"), join(dest, "SKILL.md"));
}

// The /px-* slash commands must live in .claude/commands/ — that's the only place
// Claude Code discovers project slash commands. A skill folder's nested commands/
// subdir is NOT scanned, which is why /px-assess was "Unknown command".
async function dropSlashCommands(repoRoot: string): Promise<number> {
  const dest = join(repoRoot, ".claude", "commands");
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(COMMANDS_SRC, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      await fs.copyFile(join(COMMANDS_SRC, entry.name), join(dest, entry.name));
      count++;
    }
  }
  return count;
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

const flag = process.argv[2];
if (flag === "--mcp") {
  await import("../mcp-server/index.js");
} else {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
