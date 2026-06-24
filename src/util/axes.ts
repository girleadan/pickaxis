import { SKILL_AXES } from "../profile/model.js";

/**
 * Pick the axis with the lowest `level + confidence`. Ties go to the first axis in
 * SKILL_AXES (deterministic starting point when a profile is fresh).
 */
export function weakestAxis(
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
