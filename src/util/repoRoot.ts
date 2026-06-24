import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Resolve the project root in this priority:
 *   1. PICKAXIS_REPO_ROOT env var
 *   2. Walk up from cwd to the nearest dir containing pickaxis.yaml
 *   3. Fall back to cwd
 *
 * Used by the MCP server entrypoint and by hook handlers — they can't import
 * from each other without one booting the other, so this util lives separately.
 */
export function resolveRepoRoot(): string {
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
