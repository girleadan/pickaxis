import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

export interface DetectedStack {
  id: string;
  kind: "language" | "framework";
  name: string;
  root: string; // repo-relative dir where the evidence lives ("." for root)
  evidence: string[];
}

export interface StackProfile {
  stacks: DetectedStack[];
  primaryLanguage?: string; // file extension without the dot, e.g. "py"
  languageCensus: Record<string, number>;
}

const LANGUAGE_EXT: Record<string, { id: string; name: string }> = {
  py: { id: "python", name: "Python" },
  ts: { id: "node", name: "TypeScript/JS" },
  tsx: { id: "node", name: "TypeScript/JS" },
  js: { id: "node", name: "TypeScript/JS" },
  jsx: { id: "node", name: "TypeScript/JS" },
  php: { id: "php", name: "PHP" },
  go: { id: "go", name: "Go" },
  rb: { id: "ruby", name: "Ruby" },
  java: { id: "java", name: "Java" },
  kt: { id: "java", name: "Kotlin/JVM" },
  rs: { id: "rust", name: "Rust" },
  cs: { id: "dotnet", name: "C#/.NET" },
};

const TEST_PATH = /(^|\/)(tests?|__tests__|spec)(\/|$)|\.(test|spec)\.|_test\.py$/i;

function dirOf(relPath: string): string {
  const d = dirname(relPath);
  return d === "." ? "." : d;
}

interface ManifestHit {
  file: string; // repo-relative
  root: string; // dir of the manifest
  deps: string[]; // dependency names (lowercased)
  raw: string; // raw text (for substring checks)
}

async function readManifest(repoRoot: string, relFile: string): Promise<ManifestHit | null> {
  try {
    const raw = await fs.readFile(join(repoRoot, relFile), "utf8");
    const deps = new Set<string>();
    if (relFile.endsWith(".json")) {
      const json = JSON.parse(raw) as Record<string, unknown>;
      // npm
      for (const k of ["dependencies", "devDependencies", "peerDependencies"]) {
        const block = json[k];
        if (block && typeof block === "object") {
          for (const name of Object.keys(block as Record<string, unknown>)) deps.add(name.toLowerCase());
        }
      }
      // composer
      for (const k of ["require", "require-dev"]) {
        const block = json[k];
        if (block && typeof block === "object") {
          for (const name of Object.keys(block as Record<string, unknown>)) deps.add(name.toLowerCase());
        }
      }
    } else {
      // pyproject.toml / requirements.txt / Gemfile / go.mod — substring dep scan is enough
      for (const line of raw.split("\n")) {
        const m = line.match(/^\s*['"]?([A-Za-z0-9_.\-/]+)/);
        if (m) deps.add(m[1].toLowerCase());
      }
    }
    return { file: relFile, root: dirOf(relFile), deps: [...deps], raw: raw.toLowerCase() };
  } catch {
    return null;
  }
}

const MANIFEST_NAMES = new Set([
  "package.json",
  "composer.json",
  "pyproject.toml",
  "requirements.txt",
  "go.mod",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "Cargo.toml",
]);

// Framework signatures: matched against manifest deps/raw or against a marker filename.
interface FrameworkSig {
  id: string;
  name: string;
  // a dep whose name contains any of these (lowercased substring)
  depIncludes?: string[];
  // a marker file basename anywhere in the tree
  markerFile?: RegExp;
}

const FRAMEWORK_SIGS: FrameworkSig[] = [
  { id: "django", name: "Django", depIncludes: ["django"], markerFile: /(^|\/)manage\.py$/ },
  { id: "flask", name: "Flask", depIncludes: ["flask"] },
  { id: "fastapi", name: "FastAPI", depIncludes: ["fastapi"] },
  { id: "shopware", name: "Shopware", depIncludes: ["shopware/"] },
  { id: "symfony", name: "Symfony", depIncludes: ["symfony/"] },
  { id: "laravel", name: "Laravel", depIncludes: ["laravel/framework"] },
  { id: "rails", name: "Rails", depIncludes: ["rails"] },
  { id: "next", name: "Next.js", depIncludes: ["next"] },
  { id: "nuxt", name: "Nuxt", depIncludes: ["nuxt"] },
  { id: "nestjs", name: "NestJS", depIncludes: ["@nestjs/core"] },
  { id: "react", name: "React", depIncludes: ["react"] },
  { id: "vue", name: "Vue", depIncludes: ["vue"] },
  { id: "svelte", name: "Svelte", depIncludes: ["svelte"] },
  { id: "angular", name: "Angular", depIncludes: ["@angular/core"] },
  { id: "express", name: "Express", depIncludes: ["express"] },
  { id: "vite", name: "Vite", depIncludes: ["vite"] },
];

function depMatches(hit: ManifestHit, needles: string[]): string | undefined {
  for (const needle of needles) {
    const dep = hit.deps.find((d) => d.includes(needle));
    if (dep) return dep;
  }
  return undefined;
}

export async function detectStacks(repoRoot: string, files: string[]): Promise<StackProfile> {
  // 1. Language census by extension (non-test files).
  const census: Record<string, number> = {};
  for (const f of files) {
    if (TEST_PATH.test(f)) continue;
    const m = f.match(/\.([A-Za-z0-9]+)$/);
    if (!m) continue;
    const ext = m[1].toLowerCase();
    if (LANGUAGE_EXT[ext]) census[ext] = (census[ext] ?? 0) + 1;
  }
  const sortedExts = Object.entries(census).sort((a, b) => b[1] - a[1]);
  const primaryLanguage = sortedExts[0]?.[0];

  const stacks: DetectedStack[] = [];
  const seen = new Set<string>();
  const add = (s: DetectedStack) => {
    const key = `${s.id}@${s.root}`;
    if (!seen.has(key)) {
      seen.add(key);
      stacks.push(s);
    }
  };

  // 2. Languages present (by census), with the root that has the most of that ext.
  const langRoots = new Map<string, Map<string, number>>(); // langId -> (dir -> count)
  for (const f of files) {
    if (TEST_PATH.test(f)) continue;
    const m = f.match(/\.([A-Za-z0-9]+)$/);
    const ext = m?.[1]?.toLowerCase();
    const lang = ext ? LANGUAGE_EXT[ext] : undefined;
    if (!lang) continue;
    const top = f.includes("/") ? f.slice(0, f.indexOf("/")) : ".";
    const inner = langRoots.get(lang.id) ?? new Map();
    inner.set(top, (inner.get(top) ?? 0) + 1);
    langRoots.set(lang.id, inner);
  }
  for (const [, info] of Object.entries(LANGUAGE_EXT)) {
    const roots = langRoots.get(info.id);
    if (!roots) continue;
    const bestRoot = [...roots.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ".";
    add({ id: info.id, kind: "language", name: info.name, root: bestRoot, evidence: [`${info.name} source files`] });
  }

  // 3. Frameworks via manifests found at any depth.
  const manifestFiles = files.filter((f) => MANIFEST_NAMES.has(f.split("/").pop() ?? ""));
  const hits = (await Promise.all(manifestFiles.map((f) => readManifest(repoRoot, f)))).filter(
    (h): h is ManifestHit => h !== null,
  );
  for (const hit of hits) {
    for (const sig of FRAMEWORK_SIGS) {
      if (sig.depIncludes) {
        const dep = depMatches(hit, sig.depIncludes);
        if (dep) add({ id: sig.id, kind: "framework", name: sig.name, root: hit.root, evidence: [`${dep} in ${hit.file}`] });
      }
    }
  }
  // 4. Frameworks via marker files (e.g. Django's manage.py) even without a parseable dep.
  for (const sig of FRAMEWORK_SIGS) {
    if (!sig.markerFile) continue;
    const marker = files.find((f) => sig.markerFile!.test(f));
    if (marker) add({ id: sig.id, kind: "framework", name: sig.name, root: dirOf(marker), evidence: [marker] });
  }

  return { stacks, primaryLanguage, languageCensus: census };
}

export function describeStacks(profile: StackProfile): string {
  if (profile.stacks.length === 0) return "(none detected)";
  // Group by display name, collecting the (non-root) locations.
  const order: string[] = [];
  const byName = new Map<string, string[]>();
  for (const s of [...profile.stacks].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "framework" ? -1 : 1))) {
    if (!byName.has(s.name)) {
      byName.set(s.name, []);
      order.push(s.name);
    }
    if (s.root !== ".") byName.get(s.name)!.push(s.root);
  }
  return order
    .map((name) => {
      const roots = byName.get(name)!;
      return roots.length > 0 ? `${name} (${roots.join(", ")})` : name;
    })
    .join(", ");
}
