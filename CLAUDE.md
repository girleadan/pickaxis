# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **For the long memory** — the *why* behind every shipped feature, the load-bearing design decisions, explicit non-goals, the responsibility model, and locked specs for queued work (notably Round 2's language lesson) — read **[`docs/journal.md`](docs/journal.md)**. CLAUDE.md captures architecture invariants; `journal.md` captures decision history. Consult both when planning non-trivial changes.

## Commands

```bash
npm run build       # tsc → dist/
npm run dev         # tsc --watch
npm run typecheck   # tsc --noEmit (no emit, fast lint)
npm run mcp         # run the MCP server from dist (stdio JSON-RPC; pipe requests in)
npm run init        # run the init CLI (writes pickaxis.yaml, .mcp.json, .claude/* into cwd)

# Local development against another project: use npm link (not npm publish)
cd /path/to/pickaxis && npm link
cd /path/to/target/project && npx pickaxis init  # picks up your local source

# Run init from local source without npm link (useful when iterating):
cd /path/to/target/project && node /home/dan/pickaxis/dist/init/cli.js --ref github:girleadan/pickaxis#main
```

There are no tests yet. To exercise the MCP server, pipe JSON-RPC over stdio — see `docs/getting-started.md` for the initialize/tools-list/tools-call pattern that's used throughout this session's smoke tests.

## High-level architecture

Pickaxis is an MCP server + a Claude Code skill bundle. It does **not** call an LLM itself — it piggybacks on the host AI (Claude Code) by returning structured instruction blocks that the host AI executes and then calls back into via `assess_answer`. Read these files together to grasp the design:

### The piggyback contract — `src/mcp-server/index.ts`

The server registers 10 tools but the assessment flow is just two: `assess_start` returns a **session block** for the host AI to drive (curated questions to ask + a project-specific probe of files to read and turn into questions), and `assess_answer` is how the host AI reports each graded outcome back. Both static questions (from packs) and dynamic questions (generated from code) flow through the same `assess_answer` — the **only** difference is whether you pass `questionId` (static) or `axis` + `prompt` (dynamic).

The unified `assess_start` response shape is load-bearing — any change to it must also update `skills/pickaxis/commands/px-assess.md` which teaches the host AI how to consume it:

```
{ axis, curated: [...questions], projectSpecific: { focus, files } | null, instruction }
```

`repoRoot` is resolved by the server at startup via `resolveRepoRoot()`: env override → walk up from cwd to nearest `pickaxis.yaml` → cwd. This is why `.mcp.json` never bakes in an absolute path and the server stays portable when committed.

### The scoring model — `src/profile/{model,store}.ts`

Levels are **continuous floats 0–4** (`Score` in `model.ts`); integers still validate, so older `profile.json` files are back-compatible. The display level is just `Math.round(score)` via `displayLevel()`. `summarizeProfile` renders both: `L3 (score 2.7, conf 0.62)`.

`applyAnswer(repoRoot, axis, outcome, difficulty, note?)` in `store.ts` is the assessment scoring path — exponential moving average toward a difficulty-based target (`correct → d+1`, `partial → d`, `incorrect → d-1`, `RATE = 0.5`). It returns the score delta so `assess_answer` can move a related module score by the same amount via `bumpModule`. Don't reintroduce rounding to `bumpAxis` or `bumpModule` — partials accumulating off zero depends on fractional storage. The separate `bumpAxis` exists for **passive evidence** (`profile_update`), not for assessment outcomes.

### Stack detection — `src/assessment/stackDetect.ts` + `src/mcp-server/signals.ts`

`detectStacks(repoRoot, files)` walks manifests at **any depth** (not just root) and runs a signature registry (Django, Symfony, Shopware, React, Vue, Next, Rails, Go, …) plus a file-extension census for `primaryLanguage`. `readRepoSignals` calls it and also aggregates `composerRequires` / `packageJsonDeps` across the whole tree. The detected `stacks` and `primaryLanguage` feed `frameworkFocus` and the language probe in `axisProbes.ts` — that's how the dynamic question generator knows to name "Django (src/www), Vite" instead of mislabeling a Django+Vite repo as Node.

Adding a new framework = one entry in `FRAMEWORK_SIGS` (dep substring + optional marker regex). You do **not** need a new pack to assess a new stack — the dynamic engine covers it.

### Packs are optional polish — `src/packs/`

Two packs ship: `polyglot` (always-on, generic) and `shopware-php` (auto-detects). They contribute curated questions, codemap heuristics, and anti-patterns via the `Pack` contract in `contract.ts`. The runtime uses each pack's `detects(signals)` — `pickaxis.yaml`'s `packs:` field is **informational only**, not consulted. Don't author a pack per stack as a default response to "we should support X" — the dynamic engine already does. Reach for a pack only when a stack deserves vetted, difficulty-laddered anchors.

### Four install destinations, four Claude Code subsystems

`src/init/cli.ts` writes to four places that Claude Code reads independently — getting the layout right is non-obvious:

- **`.mcp.json`** at the project root — registers the MCP server. (`.claude/settings.json`'s `mcpServers` is silently ignored by Claude Code; do not put MCP config there.)
- **`.claude/commands/px-*.md`** — slash commands. (A skill folder's nested `commands/` subdir is **not** scanned; commands must live here.)
- **`.claude/skills/pickaxis/SKILL.md`** — the skill driving Claude's proactive behavior (when to call which tool unprompted).
- **`.claude/settings.local.json`** `hooks.SessionStart` — invokes the hook once per session for a deterministic touchpoint that doesn't depend on the host AI obeying SKILL.md. Three Claude Code 2.x gotchas baked into the implementation:
  - **Location.** Hooks committed in `settings.json` require explicit per-user approval; without it they silently no-op. `settings.local.json` is auto-active per-user and the SessionStart greeting is intrinsically personal anyway.
  - **Output shape.** Plain stdout is folded silently into the model's context. For a *user-visible* notice the hook must emit `{"systemMessage": "..."}` JSON. `src/hooks/sessionStart.ts` does exactly that.
  - **Command form.** When init was run from a stable on-disk install (PACKAGE_ROOT not under `_npx/`), the hook command uses the absolute path to `dist/init/cli.js` directly. Only falls back to `npx -y <spec> --hook session-start` when init itself ran from inside an npx cache (colleague bootstrap). This avoids the npx cache race where the MCP server + hook compete for the same cache slot on Claude Code launch (manifests as `npm error code ENOTEMPTY`).
  - Merge-safe: preserves other hooks already present, replaces only the pickaxis entry.

`init` auto-detects how pickaxis was launched (npm registry vs `npx github:`) via `resolveMcpSpec()` and writes the right `npx` spec into both `.mcp.json` and the SessionStart hook, so a GitHub-only install works end-to-end without manual editing.

### CLI subcommand dispatch — `src/init/cli.ts`

`cli.ts` is the single entrypoint with three branches off `process.argv[2]`:

- `--mcp` → boots the MCP server (`src/mcp-server/index.js`)
- `--hook <name>` → runs a hook handler from `src/hooks/<name>.ts` (currently only `session-start`; `post-tool-use`, `user-prompt-submit`, `stop` are reserved for Rounds 2 & 3 — unwired in init, no handler to call them yet)
- otherwise → runs `init`

If you add a new hook in `src/hooks/`, wire the `--hook` branch *and* add the matching `register*Hook` writer in `cli.ts`'s init flow.

### Configuration — `src/config/`

`loadConfig(repoRoot)` reads `pickaxis.yaml` (defaults if missing); `saveConfig(repoRoot, patch)` round-trips through `parseDocument` so user comments and unrelated keys are preserved. The MCP server uses `loadConfig` at the top of `dispatch()` to short-circuit any tool call when `enabled: false` (except `config_get`/`config_set`). The SessionStart hook does the same check independently. **Always honor `enabled: false` — it's the load-bearing user toggle.**

`nudgeShouldFire(config, seed)` is the frequency throttle for `nudge_suggest`: deterministic per seed so the host AI can't reroll. Keep the seed stable across a single call.

### Data storage tiers — privacy is a design constraint

- **Committable / team-shared**: `pickaxis.yaml`, `.mcp.json`, `.claude/skills/pickaxis/SKILL.md`, `.claude/commands/px-*.md`.
- **Local only, never committed, never sent remotely**: everything under `~/.pickaxis/<repo-fingerprint>/` (`profile.json`, `assessments.jsonl`, `assessment-log.md`, `evidence.jsonl`). The fingerprint is `sha256(absolute repoRoot).slice(0,16)`.

The anti-surveillance stance (per README and `feedback_pickaxis_positioning` memory) is load-bearing. Do not add manager dashboards, profile sync, team aggregation, or any feature that exfiltrates the profile. If that's ever asked for, push back — it's a fork, not pickaxis.

### Positioning

Pickaxis is **framework-agnostic**. Shopware is one pilot pack, not the identity. Keep topics, copy, and examples stack-neutral; specific stacks belong inside docs/examples, not at the top level.

## Distribution

Public repo at `github.com/girleadan/pickaxis`, MIT-licensed. Not yet on npm. Install path is `npx -y github:girleadan/pickaxis#main init` — the `prepare` script in `package.json` auto-builds `dist/` after `npm install` so git installs work without committing build artifacts. When publishing to npm later, the install command becomes `npx pickaxis init` and the existing `resolveMcpSpec()` auto-detection still picks the right launch command.

## Reading guide for the docs

`README.md` (motivation/privacy) → `docs/getting-started.md` (install) → `docs/usage.md` (daily use, every command in depth, scoring model) → `docs/pack-authoring.md` (extending) → **`docs/journal.md`** (the *why* — design history, locked decisions, non-goals, the Round 2 language-lesson spec).

Update `docs/usage.md` whenever a command's behavior or response shape changes; the `/px-assess` command file at `skills/pickaxis/commands/px-assess.md` must stay in sync with `assess_start`'s response shape. Update `docs/journal.md` whenever you ship a feature — add a row to §4 with the commit hash and *why*, and flip the responsibility row in §5 if relevant.
