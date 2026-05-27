import { SkillAxis } from "../profile/model.js";
import { RepoSignals } from "../packs/contract.js";

export interface AxisProbeResult {
  files: string[];
  focus: string;
}

const PER_AXIS_CAP = 25;

const SOURCE_EXT = /\.(ts|tsx|js|jsx|py|php|go|rs|java|rb|kt|cs|swift|scala)$/i;
const TEST_PATH = /(^|\/)(tests?|__tests__|spec)(\/|$)|\.(test|spec)\.|_test\.py$/i;
const CONFIG_PATH = /\.(json|ya?ml|toml|ini|lock|cfg|conf|xml)$/i;

function dedupeCap(paths: string[]): string[] {
  return [...new Set(paths)].slice(0, PER_AXIS_CAP);
}

function dominantExtension(files: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const f of files) {
    const m = f.match(SOURCE_EXT);
    if (m && !TEST_PATH.test(f)) {
      const ext = m[1].toLowerCase();
      counts.set(ext, (counts.get(ext) ?? 0) + 1);
    }
  }
  let best: string | undefined;
  let bestN = 0;
  for (const [ext, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = ext;
    }
  }
  return best;
}

function topLevelSpread(files: string[]): string[] {
  // One or two representative files per top-level directory, to convey structure.
  const byDir = new Map<string, string[]>();
  for (const f of files) {
    if (TEST_PATH.test(f)) continue;
    const top = f.includes("/") ? f.slice(0, f.indexOf("/")) : ".";
    const arr = byDir.get(top) ?? [];
    if (arr.length < 2) arr.push(f);
    byDir.set(top, arr);
  }
  return [...byDir.values()].flat();
}

function topLevelDirs(files: string[]): string[] {
  const dirs = new Set<string>();
  for (const f of files) {
    if (f.includes("/")) dirs.add(f.slice(0, f.indexOf("/")) + "/");
  }
  return [...dirs];
}

function frameworkFocus(signals: RepoSignals): string {
  const deps = [...(signals.composerRequires ?? []), ...(signals.packageJsonDeps ?? [])];
  const known: Record<string, string> = {
    "shopware/core": "Shopware",
    "symfony/framework-bundle": "Symfony",
    laravel: "Laravel",
    django: "Django",
    react: "React",
    vue: "Vue",
    next: "Next.js",
    nuxt: "Nuxt",
    vite: "Vite",
    "@nestjs/core": "NestJS",
    express: "Express",
    fastapi: "FastAPI",
    flask: "Flask",
    rails: "Rails",
  };
  const hits = new Set<string>();
  for (const d of deps) {
    for (const key in known) {
      if (d === key || d.includes(key)) hits.add(known[key]);
    }
  }
  const named = hits.size > 0 ? ` This project appears to use: ${[...hits].join(", ")}.` : "";
  return `Assess how well the developer understands the framework(s) this project is built on — conventions, lifecycle, configuration, and the patterns the framework expects.${named}`;
}

export function probeFilesForAxis(
  axis: SkillAxis,
  files: string[],
  signals: RepoSignals,
): AxisProbeResult {
  switch (axis) {
    case "framework": {
      const manifests = files.filter((f) =>
        /(^|\/)(package\.json|composer\.json|requirements\.txt|pyproject\.toml|go\.mod|Cargo\.toml|Gemfile|build\.gradle|pom\.xml)$/.test(
          f,
        ),
      );
      const entrypoints = files.filter((f) =>
        /(^|\/)(manage\.py|artisan|settings.*\.py|app\.py|main\.(py|ts|js|go|rs)|index\.(ts|js))$/.test(
          f,
        ),
      );
      const config = files.filter((f) =>
        /(\.config\.(js|ts|mjs|cjs)$|vite\.config\.|next\.config\.|nuxt\.config\.|nest-cli\.json$|services\.xml$|webpack\.config\.)/.test(
          f,
        ),
      );
      return {
        files: dedupeCap([...manifests, ...entrypoints, ...config]),
        focus: frameworkFocus(signals),
      };
    }

    case "language": {
      const ext = dominantExtension(files);
      const src = files.filter(
        (f) => SOURCE_EXT.test(f) && !TEST_PATH.test(f) && (!ext || f.toLowerCase().endsWith("." + ext)),
      );
      // Prefer non-trivial, deeper files over top-level shims.
      src.sort((a, b) => b.split("/").length - a.split("/").length);
      return {
        files: dedupeCap(src),
        focus: `Assess the developer's command of the primary language${ext ? ` (.${ext})` : ""} as used here — idioms, error handling, standard-library usage, and common pitfalls visible in these files.`,
      };
    }

    case "codebase": {
      return {
        files: dedupeCap(topLevelSpread(files)),
        focus: `Assess how well the developer knows how THIS codebase is organized — directory layout, layering/separation of concerns, where different kinds of logic live, and why. Top-level areas: ${topLevelDirs(files).slice(0, 12).join(" ")}`,
      };
    }

    case "business": {
      const docs = files.filter((f) =>
        /(^|\/)(README|CLAUDE|CONTRIBUTING|ARCHITECTURE)[^/]*\.md$/i.test(f) || /(^|\/)docs\//i.test(f),
      );
      const models = files.filter((f) => /(^|\/)models?\//i.test(f) || /(^|\/)domain\//i.test(f));
      return {
        files: dedupeCap([...docs, ...models]),
        focus: `Assess the developer's grasp of the business domain — what the product does, who its users are, the key flows, and the domain concepts. Top-level areas may hint at domains: ${topLevelDirs(files).slice(0, 12).join(" ")}`,
      };
    }

    case "devops": {
      const ci = files.filter((f) =>
        /(^\.github\/workflows\/|(^|\/)(bitbucket-pipelines\.yml|\.gitlab-ci\.yml|azure-pipelines\.yml|Jenkinsfile)$)/.test(
          f,
        ),
      );
      const infra = files.filter((f) =>
        /(^|\/)(Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|Makefile)$|\.tf$|(^|\/)(k8s|deploy|deployment)\//i.test(
          f,
        ),
      );
      return {
        files: dedupeCap([...ci, ...infra]),
        focus: `Assess the developer's understanding of how this project is built, tested in CI, containerized, and deployed.`,
      };
    }

    case "database": {
      const dbFiles = files.filter(
        (f) =>
          /(^|\/)migrations?\//i.test(f) ||
          /(^|\/)models?\//i.test(f) ||
          /\.sql$/i.test(f) ||
          /schema\.prisma$/i.test(f),
      );
      return {
        files: dedupeCap(dbFiles),
        focus: `Assess the developer's database knowledge as it applies here — schema design, the ORM/query patterns in use, migrations, and how data is modeled.`,
      };
    }

    case "testing": {
      const tests = files.filter(
        (f) =>
          TEST_PATH.test(f) ||
          /(^|\/)(phpunit\.xml|jest\.config[^/]*|vitest\.config[^/]*|pytest\.ini|tox\.ini)$/.test(f),
      );
      return {
        files: dedupeCap(tests),
        focus: `Assess the developer's testing knowledge as practised here — what is tested, at what level (unit/integration/e2e), the test framework, and gaps in coverage.`,
      };
    }

    case "security": {
      const sec = files.filter(
        (f) =>
          /(auth|permission|security|crypto|password|token|login|middleware|session)/i.test(f) ||
          /(^|\/)\.env\.(template|example|sample)$/.test(f),
      );
      return {
        files: dedupeCap(sec.filter((f) => !TEST_PATH.test(f) && (SOURCE_EXT.test(f) || CONFIG_PATH.test(f) || f.includes(".env")))),
        focus: `Assess the developer's security awareness as it applies here — input validation, authn/authz, secret handling, and the OWASP-style risks relevant to this code.`,
      };
    }

    case "ai_literacy":
      // No meaningful code probe; this axis is covered by a static polyglot question.
      return { files: [], focus: "" };

    default:
      return { files: [], focus: "" };
  }
}
