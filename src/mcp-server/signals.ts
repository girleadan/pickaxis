import { promises as fs } from "node:fs";
import { join } from "node:path";
import { RepoSignals } from "../packs/contract.js";

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafely(path: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function readRepoSignals(repoRoot: string): Promise<RepoSignals> {
  const composerPath = join(repoRoot, "composer.json");
  const packagePath = join(repoRoot, "package.json");
  const requirementsPath = join(repoRoot, "requirements.txt");
  const pyprojectPath = join(repoRoot, "pyproject.toml");

  const [hasComposerJson, hasPackageJson, hasRequirementsTxt, hasPyprojectToml] =
    await Promise.all([
      exists(composerPath),
      exists(packagePath),
      exists(requirementsPath),
      exists(pyprojectPath),
    ]);

  let composerRequires: string[] | undefined;
  if (hasComposerJson) {
    const composer = await readJsonSafely(composerPath);
    if (composer && typeof composer.require === "object" && composer.require !== null) {
      composerRequires = Object.keys(composer.require as Record<string, unknown>);
    }
  }

  let packageJsonDeps: string[] | undefined;
  if (hasPackageJson) {
    const pkg = await readJsonSafely(packagePath);
    if (pkg) {
      const deps: string[] = [];
      for (const key of ["dependencies", "devDependencies", "peerDependencies"]) {
        const block = pkg[key];
        if (block && typeof block === "object") {
          deps.push(...Object.keys(block as Record<string, unknown>));
        }
      }
      packageJsonDeps = deps;
    }
  }

  return {
    hasComposerJson,
    hasPackageJson,
    hasRequirementsTxt,
    hasPyprojectToml,
    composerRequires,
    packageJsonDeps,
  };
}
