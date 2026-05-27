import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  AssessmentRecord,
  blankProfile,
  EvidenceEvent,
  Outcome,
  Profile,
  SKILL_AXES,
  SkillAxis,
} from "./model.js";

export function repoFingerprint(repoRoot: string): string {
  const absolute = resolve(repoRoot);
  return createHash("sha256").update(absolute).digest("hex").slice(0, 16);
}

export function profileDir(repoRoot: string): string {
  return join(homedir(), ".pickaxis", repoFingerprint(repoRoot));
}

function profilePath(repoRoot: string): string {
  return join(profileDir(repoRoot), "profile.json");
}

function evidencePath(repoRoot: string): string {
  return join(profileDir(repoRoot), "evidence.jsonl");
}

function assessmentsPath(repoRoot: string): string {
  return join(profileDir(repoRoot), "assessments.jsonl");
}

function assessmentLogPath(repoRoot: string): string {
  return join(profileDir(repoRoot), "assessment-log.md");
}

async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true });
}

export async function loadProfile(repoRoot: string): Promise<Profile | null> {
  try {
    const raw = await fs.readFile(profilePath(repoRoot), "utf8");
    return Profile.parse(JSON.parse(raw));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function loadOrInitProfile(
  repoRoot: string,
  packsLoaded: string[] = [],
): Promise<Profile> {
  const existing = await loadProfile(repoRoot);
  if (existing) return existing;
  const fresh = blankProfile(repoFingerprint(repoRoot), packsLoaded);
  await saveProfile(repoRoot, fresh);
  return fresh;
}

export async function saveProfile(repoRoot: string, profile: Profile): Promise<void> {
  await ensureDir(profileDir(repoRoot));
  profile.updatedAt = new Date().toISOString();
  await fs.writeFile(profilePath(repoRoot), JSON.stringify(profile, null, 2), "utf8");
}

export async function appendEvidence(
  repoRoot: string,
  event: EvidenceEvent,
): Promise<void> {
  await ensureDir(profileDir(repoRoot));
  EvidenceEvent.parse(event);
  await fs.appendFile(evidencePath(repoRoot), JSON.stringify(event) + "\n", "utf8");
}

export async function bumpAxis(
  repoRoot: string,
  axis: SkillAxis,
  delta: number,
  note?: string,
): Promise<Profile> {
  const profile = await loadOrInitProfile(repoRoot);
  const current = profile.axes[axis] ?? { level: 0, confidence: 0 };
  const newLevel = Math.max(0, Math.min(4, Math.round(current.level + delta)));
  profile.axes[axis] = {
    level: newLevel,
    confidence: Math.min(1, current.confidence + 0.1),
    lastAssessedAt: new Date().toISOString(),
    notes: note ?? current.notes,
  };
  await saveProfile(repoRoot, profile);
  return profile;
}

// Upsert a per-module familiarity score. Module assessment is the only thing that
// populates Profile.modules[] (passive edit-tracking will too, later).
export async function bumpModule(
  repoRoot: string,
  modulePath: string,
  delta: number,
): Promise<Profile> {
  const profile = await loadOrInitProfile(repoRoot);
  const existing = profile.modules.find((m) => m.path === modulePath);
  const now = new Date().toISOString();
  if (existing) {
    existing.level = Math.max(0, Math.min(4, Math.round(existing.level + delta)));
    existing.lastTouchedAt = now;
  } else {
    profile.modules.push({
      path: modulePath,
      level: Math.max(0, Math.min(4, Math.round(delta))),
      edits: 0,
      lastTouchedAt: now,
    });
  }
  await saveProfile(repoRoot, profile);
  return profile;
}

export async function appendAssessmentRecord(
  repoRoot: string,
  record: AssessmentRecord,
): Promise<void> {
  await ensureDir(profileDir(repoRoot));
  AssessmentRecord.parse(record);
  await fs.appendFile(
    assessmentsPath(repoRoot),
    JSON.stringify(record) + "\n",
    "utf8",
  );
  await appendAssessmentMarkdown(repoRoot, record);
}

const OUTCOME_ICON: Record<Outcome, string> = {
  correct: "✅ correct",
  partial: "◐ partial",
  incorrect: "✗ incorrect",
  skipped: "– skipped",
};

async function appendAssessmentMarkdown(
  repoRoot: string,
  record: AssessmentRecord,
): Promise<void> {
  const scope = record.module ? `${record.axis} · ${record.module}` : record.axis;
  const lines = [
    `### ${record.at} — ${scope} — ${OUTCOME_ICON[record.outcome]}`,
    "",
    `**Q:** ${record.prompt}`,
  ];
  if (record.answerSummary) lines.push("", `**Your answer:** ${record.answerSummary}`);
  if (record.graderNotes) lines.push("", `**Feedback:** ${record.graderNotes}`);
  lines.push("", "---", "");
  await fs.appendFile(assessmentLogPath(repoRoot), lines.join("\n") + "\n", "utf8");
}

export interface AssessmentFilter {
  axis?: SkillAxis;
  module?: string;
  outcomes?: Outcome[];
  limit?: number;
}

export async function readAssessmentRecords(
  repoRoot: string,
  filter: AssessmentFilter = {},
): Promise<AssessmentRecord[]> {
  let raw: string;
  try {
    raw = await fs.readFile(assessmentsPath(repoRoot), "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const records: AssessmentRecord[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(AssessmentRecord.parse(JSON.parse(trimmed)));
    } catch {
      // skip malformed lines
    }
  }
  let filtered = records;
  if (filter.axis) filtered = filtered.filter((r) => r.axis === filter.axis);
  if (filter.module) filtered = filtered.filter((r) => r.module === filter.module);
  if (filter.outcomes && filter.outcomes.length > 0) {
    filtered = filtered.filter((r) => filter.outcomes!.includes(r.outcome));
  }
  filtered.reverse(); // newest first
  if (filter.limit && filter.limit > 0) filtered = filtered.slice(0, filter.limit);
  return filtered;
}

export function assessmentLogFile(repoRoot: string): string {
  return assessmentLogPath(repoRoot);
}

export function summarizeProfile(profile: Profile): string {
  const lines: string[] = [];
  lines.push(`Pickaxis profile · fingerprint ${profile.repoFingerprint}`);
  lines.push(`Updated ${profile.updatedAt}`);
  lines.push("");
  lines.push("Skill axes:");
  for (const axis of SKILL_AXES) {
    const score = profile.axes[axis];
    if (!score) continue;
    lines.push(`  ${axis.padEnd(14)} L${score.level} (conf ${score.confidence.toFixed(2)})`);
  }
  if (profile.modules.length > 0) {
    lines.push("");
    lines.push("Module familiarity:");
    for (const m of profile.modules.slice(0, 10)) {
      lines.push(`  L${m.level}  ${m.path}  (${m.edits} edits)`);
    }
  }
  return lines.join("\n");
}

