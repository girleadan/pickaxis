import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  blankProfile,
  EvidenceEvent,
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

