import { z } from "zod";

export const SKILL_AXES = [
  "devops",
  "language",
  "framework",
  "codebase",
  "business",
  "database",
  "testing",
  "security",
  "ai_literacy",
] as const;

export type SkillAxis = (typeof SKILL_AXES)[number];

export const SKILL_AXIS_LABELS: Record<SkillAxis, string> = {
  devops: "DevOps",
  language: "Language",
  framework: "Framework",
  codebase: "Codebase familiarity",
  business: "Business domain",
  database: "Database",
  testing: "Testing",
  security: "Security",
  ai_literacy: "AI literacy",
};

export const SkillLevel = z.number().int().min(0).max(4);
export type SkillLevel = z.infer<typeof SkillLevel>;

export const LEVEL_NAMES = ["unknown", "novice", "familiar", "proficient", "expert"] as const;

export const AxisScore = z.object({
  level: SkillLevel,
  confidence: z.number().min(0).max(1),
  lastAssessedAt: z.string().datetime().optional(),
  notes: z.string().optional(),
});
export type AxisScore = z.infer<typeof AxisScore>;

export const ModuleFamiliarity = z.object({
  path: z.string(),
  level: SkillLevel,
  edits: z.number().int().nonnegative().default(0),
  lastTouchedAt: z.string().datetime().optional(),
});
export type ModuleFamiliarity = z.infer<typeof ModuleFamiliarity>;

export const Profile = z.object({
  schemaVersion: z.literal(1),
  repoFingerprint: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  axes: z.record(z.enum(SKILL_AXES), AxisScore),
  modules: z.array(ModuleFamiliarity).default([]),
  packsLoaded: z.array(z.string()).default([]),
});
export type Profile = z.infer<typeof Profile>;

export function blankProfile(repoFingerprint: string, packsLoaded: string[] = []): Profile {
  const now = new Date().toISOString();
  const axes = {} as Profile["axes"];
  for (const axis of SKILL_AXES) {
    axes[axis] = { level: 0, confidence: 0 };
  }
  return {
    schemaVersion: 1,
    repoFingerprint,
    createdAt: now,
    updatedAt: now,
    axes,
    modules: [],
    packsLoaded,
  };
}

export const EvidenceEvent = z.object({
  at: z.string().datetime(),
  kind: z.enum([
    "edit",
    "ai_prompt",
    "ai_accept",
    "commit",
    "assessment_answer",
    "challenge_completed",
  ]),
  axis: z.enum(SKILL_AXES).optional(),
  modulePath: z.string().optional(),
  detail: z.string().optional(),
  scoreDelta: z.number().optional(),
});
export type EvidenceEvent = z.infer<typeof EvidenceEvent>;
