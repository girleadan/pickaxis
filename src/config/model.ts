import { z } from "zod";

export const Frequency = z.enum(["rare", "balanced", "intensive"]);
export type Frequency = z.infer<typeof Frequency>;

export const FeatureFlags = z.object({
  nudges: z.boolean().default(true),
  challenges: z.boolean().default(true),
  ticketLoop: z.boolean().default(true),
  sessionDigest: z.boolean().default(true),
});
export type FeatureFlags = z.infer<typeof FeatureFlags>;

// Parsed config used at runtime. Lenient: any missing key falls back to defaults.
export const PickaxisConfig = z.object({
  enabled: z.boolean().default(true),
  features: FeatureFlags.default({
    nudges: true,
    challenges: true,
    ticketLoop: true,
    sessionDigest: true,
  }),
  frequency: Frequency.default("balanced"),
});
export type PickaxisConfig = z.infer<typeof PickaxisConfig>;

export const DEFAULT_CONFIG: PickaxisConfig = {
  enabled: true,
  features: { nudges: true, challenges: true, ticketLoop: true, sessionDigest: true },
  frequency: "balanced",
};

export function summarizeConfig(c: PickaxisConfig): string {
  const flags = Object.entries(c.features)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(", ");
  return `pickaxis: ${c.enabled ? "ENABLED" : "DISABLED"} · frequency=${c.frequency} · features=${flags || "(none)"}`;
}

export const FREQUENCY_NUDGE_PROBABILITY: Record<Frequency, number> = {
  rare: 0.15,
  balanced: 0.5,
  intensive: 1.0,
};
