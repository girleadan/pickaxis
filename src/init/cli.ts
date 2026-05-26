#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stringify as yamlStringify } from "yaml";
import { detectPacks } from "../packs/index.js";
import { readRepoSignals } from "../mcp-server/signals.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, "..", "..");
const SKILL_SRC = join(PACKAGE_ROOT, "skills", "pickaxis");

async function main() {
  const repoRoot = resolve(process.cwd());
  console.log(`Initializing pickaxis in ${repoRoot}`);

  const signals = await readRepoSignals(repoRoot);
  const packs = detectPacks(signals);
  console.log(`  detected packs: ${packs.map((p) => p.id).join(", ") || "(none)"}`);

  await writeConfig(repoRoot, packs.map((p) => p.id));
  console.log("  wrote pickaxis.yaml");

  const mcpSpec = await resolveMcpSpec();
  await registerMcpServer(repoRoot, mcpSpec);
  console.log(`  registered MCP server in .claude/settings.json (using "${mcpSpec}")`);

  await dropSkillBundle(repoRoot);
  console.log("  installed skill bundle to .claude/skills/pickaxis/");

  console.log("");
  console.log("Done. In Claude Code, run /px-assess to take the initial assessment.");
}

/**
 * Decide what string to pass to `npx -y <SPEC> --mcp` so the MCP server can be launched later.
 *
 * Priority:
 *   1. Explicit --ref <spec> flag from the command line.
 *   2. Auto-detected from this package's own package.json `_from` field, which npm
 *      sets when the package was installed from a non-registry source (git URL, tarball, local path).
 *   3. Fallback to the bare package name (assumes a future npm publish).
 */
async function resolveMcpSpec(): Promise<string> {
  const refFlag = getRefFromArgv();
  if (refFlag) return refFlag;

  try {
    const ownPackageJson = JSON.parse(
      await fs.readFile(join(PACKAGE_ROOT, "package.json"), "utf8"),
    );
    const from = ownPackageJson._from;
    if (
      typeof from === "string" &&
      (from.startsWith("github:") ||
        from.startsWith("gitlab:") ||
        from.startsWith("bitbucket:") ||
        from.startsWith("git+") ||
        from.startsWith("git://") ||
        from.endsWith(".git") ||
        from.endsWith(".tgz"))
    ) {
      return from;
    }
  } catch {
    // ignore — fall through to default
  }

  return "pickaxis";
}

function getRefFromArgv(): string | undefined {
  const argv = process.argv;
  const idx = argv.indexOf("--ref");
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
  const eqArg = argv.find((a) => a.startsWith("--ref="));
  if (eqArg) return eqArg.slice("--ref=".length);
  return undefined;
}

async function writeConfig(repoRoot: string, packIds: string[]): Promise<void> {
  const configPath = join(repoRoot, "pickaxis.yaml");
  if (await exists(configPath)) {
    console.log("  pickaxis.yaml already exists — leaving it alone");
    return;
  }
  const config = {
    packs: packIds,
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

async function registerMcpServer(repoRoot: string, mcpSpec: string): Promise<void> {
  const settingsDir = join(repoRoot, ".claude");
  const settingsPath = join(settingsDir, "settings.json");
  await fs.mkdir(settingsDir, { recursive: true });

  let settings: Record<string, unknown> = {};
  if (await exists(settingsPath)) {
    try {
      settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
    } catch {
      console.warn("  .claude/settings.json exists but is not valid JSON — skipping merge");
      return;
    }
  }

  const mcpServers =
    (settings.mcpServers as Record<string, unknown> | undefined) ?? {};
  mcpServers.pickaxis = {
    command: "npx",
    args: ["-y", mcpSpec, "--mcp"],
    env: { PICKAXIS_REPO_ROOT: repoRoot },
  };
  settings.mcpServers = mcpServers;

  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
}

async function dropSkillBundle(repoRoot: string): Promise<void> {
  const dest = join(repoRoot, ".claude", "skills", "pickaxis");
  await copyDir(SKILL_SRC, dest);
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(from, to);
    } else {
      await fs.copyFile(from, to);
    }
  }
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
