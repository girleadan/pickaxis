import { promises as fs } from "node:fs";
import { join } from "node:path";
import { RepoSignals } from "../packs/contract.js";
import { walkRepo } from "../codemap/indexer.js";
import { detectStacks } from "../assessment/stackDetect.js";

async function readJsonSafely(path: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function basename(relPath: string): string {
  return relPath.split("/").pop() ?? relPath;
}

export async function readRepoSignals(repoRoot: string): Promise<RepoSignals> {
  const files = await walkRepo(repoRoot);

  // Aggregate manifests across the whole tree, not just the repo root.
  const composerFiles = files.filter((f) => basename(f) === "composer.json");
  const packageFiles = files.filter((f) => basename(f) === "package.json");
  const hasComposerJson = composerFiles.length > 0;
  const hasPackageJson = packageFiles.length > 0;
  const hasRequirementsTxt = files.some((f) => basename(f) === "requirements.txt");
  const hasPyprojectToml = files.some((f) => basename(f) === "pyproject.toml");

  const composerSet = new Set<string>();
  for (const rel of composerFiles) {
    const composer = await readJsonSafely(join(repoRoot, rel));
    if (composer && typeof composer.require === "object" && composer.require !== null) {
      for (const k of Object.keys(composer.require as Record<string, unknown>)) composerSet.add(k);
    }
  }

  const packageSet = new Set<string>();
  for (const rel of packageFiles) {
    const pkg = await readJsonSafely(join(repoRoot, rel));
    if (!pkg) continue;
    for (const key of ["dependencies", "devDependencies", "peerDependencies"]) {
      const block = pkg[key];
      if (block && typeof block === "object") {
        for (const name of Object.keys(block as Record<string, unknown>)) packageSet.add(name);
      }
    }
  }

  const { stacks, primaryLanguage } = await detectStacks(repoRoot, files);

  return {
    hasComposerJson,
    hasPackageJson,
    hasRequirementsTxt,
    hasPyprojectToml,
    composerRequires: composerSet.size > 0 ? [...composerSet] : undefined,
    packageJsonDeps: packageSet.size > 0 ? [...packageSet] : undefined,
    stacks,
    primaryLanguage,
  };
}
