import { loadConfig } from "../config/loader.js";
import { loadOrInitProfile } from "../profile/store.js";
import { displayLevel } from "../profile/model.js";
import { resolveRepoRoot } from "../util/repoRoot.js";
import { weakestAxis } from "../util/axes.js";

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
