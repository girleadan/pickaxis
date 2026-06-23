import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { parseDocument, stringify as yamlStringify, YAMLMap } from "yaml";
import { DEFAULT_CONFIG, PickaxisConfig } from "./model.js";

function configPath(repoRoot: string): string {
  return join(resolve(repoRoot), "pickaxis.yaml");
}

// Walk up from a starting dir to find pickaxis.yaml. Mirrors the MCP server's
// repoRoot resolution so config and profile stay coherent.
async function findConfigPath(startDir: string): Promise<string | null> {
  let dir = resolve(startDir);
  for (let i = 0; i < 25; i++) {
    const candidate = join(dir, "pickaxis.yaml");
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // continue
    }
    const parent = resolve(dir, "..");
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/**
 * Load the merged pickaxis config — defaults overlaid by whatever the yaml has.
 * Missing file or missing fields fall back silently to defaults; an unparseable
 * yaml also falls back (we log nothing here; the CLI/hook surfaces decide).
 */
export async function loadConfig(repoRoot: string): Promise<PickaxisConfig> {
  let raw: string;
  try {
    raw = await fs.readFile(configPath(repoRoot), "utf8");
  } catch {
    const found = await findConfigPath(repoRoot);
    if (!found) return DEFAULT_CONFIG;
    raw = await fs.readFile(found, "utf8");
  }

  try {
    const doc = parseDocument(raw);
    const obj = doc.toJSON() ?? {};
    return PickaxisConfig.parse({
      enabled: obj.enabled,
      features: obj.features,
      frequency: obj.frequency,
    });
  } catch {
    return DEFAULT_CONFIG;
  }
}

export type ConfigPatch = {
  enabled?: boolean;
  features?: Partial<PickaxisConfig["features"]>;
  frequency?: PickaxisConfig["frequency"];
};

/**
 * Merge a partial config patch into pickaxis.yaml at the repo root.
 * Uses parseDocument so existing comments and unrelated keys (packs,
 * detectedStacks, privacy, …) are preserved on a round-trip. If the file
 * doesn't exist, writes a fresh one with only the config keys.
 */
export async function saveConfig(repoRoot: string, patch: ConfigPatch): Promise<PickaxisConfig> {
  const path = configPath(repoRoot);
  let doc;
  try {
    const raw = await fs.readFile(path, "utf8");
    doc = parseDocument(raw);
  } catch {
    doc = parseDocument("# pickaxis configuration\n");
  }

  if (patch.enabled !== undefined) doc.set("enabled", patch.enabled);
  if (patch.frequency !== undefined) doc.set("frequency", patch.frequency);
  if (patch.features) {
    const existing = (doc.get("features") as YAMLMap | undefined) ?? null;
    const merged = {
      ...DEFAULT_CONFIG.features,
      ...(existing ? (existing.toJSON() as Record<string, boolean>) : {}),
      ...patch.features,
    };
    doc.set("features", merged);
  }

  await fs.writeFile(path, doc.toString({ lineWidth: 0 }), "utf8");
  return loadConfig(repoRoot);
}

// Convenience: deterministic decision whether a nudge call should produce one,
// given the current frequency setting + a stable seed (so the host AI can't
// "retry" to get a different outcome).
import { FREQUENCY_NUDGE_PROBABILITY } from "./model.js";
import { createHash } from "node:crypto";

export function nudgeShouldFire(
  config: PickaxisConfig,
  seed: string,
): boolean {
  if (!config.enabled || !config.features.nudges) return false;
  const p = FREQUENCY_NUDGE_PROBABILITY[config.frequency];
  if (p >= 1) return true;
  if (p <= 0) return false;
  // Hash the seed into [0,1); compare to threshold.
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 12);
  const n = parseInt(hex, 16) / 0xffffffffffff;
  return n < p;
}

// Re-export so callers don't need to import the model just to satisfy types.
export { yamlStringify };
