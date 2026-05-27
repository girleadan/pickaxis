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

// Integer 0–4 — used for *display* and for indexing LEVEL_NAMES.
export const SkillLevel = z.number().int().min(0).max(4);
export type SkillLevel = z.infer<typeof SkillLevel>;

// Continuous 0–4 — the *stored* score. Accumulates fractional evidence so partial
// answers aren't lost to rounding. Integers (from older profiles) validate fine.
export const Score = z.number().min(0).max(4);
export type Score = z.infer<typeof Score>;

export const LEVEL_NAMES = ["unknown", "novice", "familiar", "proficient", "expert"] as const;

export function displayLevel(score: number): SkillLevel {
  return Math.max(0, Math.min(4, Math.round(score))) as SkillLevel;
}

export const AxisScore = z.object({
  level: Score,
  confidence: z.number().min(0).max(1),
  lastAssessedAt: z.string().datetime().optional(),
  notes: z.string().optional(),
});
export type AxisScore = z.infer<typeof AxisScore>;

export const ModuleFamiliarity = z.object({
  path: z.string(),
  level: Score,
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

export const Outcome = z.enum(["correct", "partial", "incorrect", "skipped"]);
export type Outcome = z.infer<typeof Outcome>;

// A full, reviewable record of one assessed question. Unlike EvidenceEvent (a thin
// passive-signal trail) this keeps the question, the dev's answer, and the grader's
// reasoning so "what did I get wrong" is answerable later.
export const AssessmentRecord = z.object({
  at: z.string().datetime(),
  axis: z.enum(SKILL_AXES),
  module: z.string().optional(),
  questionId: z.string().optional(),
  prompt: z.string(),
  answerSummary: z.string().optional(),
  outcome: Outcome,
  graderNotes: z.string().optional(),
  scoreDelta: z.number(),
});
export type AssessmentRecord = z.infer<typeof AssessmentRecord>;
