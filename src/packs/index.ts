import { Pack, RepoSignals } from "./contract.js";
import { polyglot } from "./polyglot/index.js";
import { shopwarePhp } from "./shopware-php/index.js";

export const BUILTIN_PACKS: Pack[] = [polyglot, shopwarePhp];

export function detectPacks(signals: RepoSignals): Pack[] {
  return BUILTIN_PACKS.filter((p) => p.detects(signals));
}

export function getPack(id: string): Pack | undefined {
  return BUILTIN_PACKS.find((p) => p.id === id);
}

export { Pack, RepoSignals } from "./contract.js";
