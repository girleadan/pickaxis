import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { loadConfig } from "../config/loader.js";
import { loadOrInitProfile } from "../profile/store.js";
import { displayLevel, SKILL_AXES } from "../profile/model.js";

// Same logic as the MCP server's resolveRepoRoot — find the nearest pickaxis.yaml
// walking up from cwd. The SessionStart hook runs at Claude Code startup with
// cwd = project root, but be robust.
function resolveRepoRoot(): string {
  if (process.env.PICKAXIS_REPO_ROOT) return resolve(process.env.PICKAXIS_REPO_ROOT);
  let dir = resolve(process.cwd());
  for (let i = 0; i < 25; i++) {
    if (existsSync(join(dir, "pickaxis.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(process.cwd());
}

function weakestAxis(
  axes: Record<string, { level: number; confidence: number } | undefined>,
): (typeof SKILL_AXES)[number] {
  let weak: (typeof SKILL_AXES)[number] = SKILL_AXES[0];
  let weakScore = Infinity;
  for (const axis of SKILL_AXES) {
    const s = axes[axis];
    const score = s ? s.level + s.confidence : 0;
    if (score < weakScore) {
      weakScore = score;
      weak = axis;
    }
  }
  return weak;
}

export async function runSessionStart(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  const config = await loadConfig(repoRoot);
  if (!config.enabled) return; // silent when disabled

  const profile = await loadOrInitProfile(repoRoot);

  // Brand-new profile (everything at 0/0) → onboarding nudge.
  const hasSignal = Object.values(profile.axes).some(
    (s) => s && (s.level > 0 || s.confidence > 0),
  );
  if (!hasSignal) {
    process.stdout.write(
      "🪨 pickaxis: no profile yet for this project — try `/px-assess` for a quick warm-up, or `/px-config` to tune what fires.\n",
    );
    return;
  }

  const axis = weakestAxis(profile.axes);
  const score = profile.axes[axis];
  const level = score ? displayLevel(score.level) : 0;
  const scoreVal = score ? score.level.toFixed(1) : "0.0";
  process.stdout.write(
    `🪨 pickaxis: weakest axis is \`${axis}\` (L${level}, score ${scoreVal}). Try \`/px-assess ${axis}\`, \`/px-challenge\`, or \`/px-config\` to tune.\n`,
  );
}
