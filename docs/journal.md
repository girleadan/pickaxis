# Pickaxis project journal

> Read this if you weren't here when it was built. It captures the **why** behind the code — the load-bearing design decisions, the shipped chronology, the explicit non-goals, and the locked specs for work still queued. The code is the *what*; this is the *why*.

For day-to-day usage see [`usage.md`](usage.md). For the architecture summary that every Claude Code session needs, see [`CLAUDE.md`](../CLAUDE.md). This journal is the long memory.

---

## 1. Why pickaxis exists

AI coding tools let developers ship code they don't understand. "Vibe coding" produces working software but stalls the developer's growth — they can't navigate the codebase, debug without the AI, or reason about architecture. Over time they become dependent on the AI and slower without it.

Pickaxis sits next to the developer's AI tool, turns each session into a learning surface, and tries to make sure the human gets *sharper, not duller*, with every commit. It is **not a replacement** for the AI tool — it's a layer on top of it.

---

## 2. Load-bearing design decisions

These are the ones that shape everything else. Future changes should not violate them without explicit conversation.

### 2.1 The piggyback model (no LLM inside pickaxis)

Pickaxis emits **structured instruction blocks** and the **host AI** (Claude Code) executes them. Grading, question generation, content distillation — all done by the AI the developer already trusts. Consequences:

- **No API key.** No extra cost. No third-party code-handling liability beyond what the host AI tool already has.
- **No data leaves the machine via pickaxis.** Everything pickaxis itself touches is local files.
- **No ML training, no model behind pickaxis.** When someone asks "can we add ML" or "can pickaxis learn from tickets," the answer is: the host AI is the inference engine. Add a tool that gives Claude the right context and let it do the inference.

### 2.2 Anti-surveillance is load-bearing

- Per-developer profile lives at `~/.pickaxis/<repo-fingerprint>/` and is **never committed, never sent remotely** by pickaxis.
- The repo-level `pickaxis.yaml` *is* committed (team-shared config) but contains no profile data.
- Explicit non-goals (will not be built): manager dashboards, profile sync, team aggregation, AI-vs-human comparison reports across devs. If a future user asks for these, push back: it's a fork, not pickaxis.

### 2.3 No per-stack curated pack as the default response to "support X"

Hand-authoring a `python-django` pack, then a `php-symfony` pack, then a `react` pack… doesn't scale. Pickaxis instead has a **dynamic question engine** that reads the project's code and generates questions for any stack. Curated packs (`polyglot`, `shopware-php`) are *optional polish*, not the path to "supporting" a new stack.

**Heuristic:** when someone says "we should support X" — first ask whether detection sees X, and whether the dynamic engine produces sensible questions for it. Only write a curated pack if you specifically want vetted, difficulty-laddered anchors for a stack you care about deeply.

### 2.4 Distribution: GitHub-only, then npm

Pickaxis ships from public GitHub via `npx -y github:girleadan/pickaxis#main init`. The `prepare` script in `package.json` builds `dist/` after `npm install`, so we don't commit build artifacts. `init` auto-detects the git spec used to launch it and writes the matching `npx -y <spec>` into `.mcp.json` and the SessionStart hook, so the GitHub-only install works **end-to-end** without manual editing of any settings.

`npm publish` is deferred — it locks the name permanently (an explicit one-way door) and we want a few real users first. When it ships, the same `resolveMcpSpec()` chooses `pickaxis` over the git spec automatically.

### 2.5 Scoring is continuous + difficulty-weighted

Axis levels are stored as **continuous floats 0–4** (`Score`), displayed as integer levels (`displayLevel`). The `applyAnswer` path uses an EMA toward a difficulty-based target:

| Outcome | Target |
| --- | --- |
| correct | `min(4, difficulty + 1)` |
| partial | `difficulty` |
| incorrect | `max(0, difficulty - 1)` |
| skipped | unchanged |

`newScore = clamp(score + 0.5 × (target − score), 0, 4)`. Consequences worth knowing:

- **Partials always count.** They used to round away — they no longer do.
- **Hard questions move you more.** L4 is unreachable without correctly answering difficulty 3–4 questions. Easy questions can't take you past L2 by themselves.
- `bumpAxis` (used for passive evidence via `profile_update`) and `bumpModule` are additive + fractional too — don't reintroduce rounding to them.

### 2.6 The dev's toggle is enforced at the MCP layer

When `config.enabled` is `false`, every MCP tool **except** `config_get`/`config_set` returns `"pickaxis is currently disabled. Run /px-config enable to turn it back on."` This means the host AI can't accidentally interrupt the dev even if it ignores SKILL.md. The same check is performed by the SessionStart hook independently.

### 2.7 Three places Claude Code reads, four that init writes to

Future Claude Code sessions should keep this layout straight:

| Path | What it does | Common confusion |
| --- | --- | --- |
| `.mcp.json` at project root | Registers MCP servers (the canonical place) | An `mcpServers` block inside `.claude/settings.json` is **silently ignored** — do not put MCP config there. |
| `.claude/commands/px-*.md` | Slash commands | A skill folder's nested `commands/` subdir is **not** scanned. Slash commands must live in `.claude/commands/`. |
| `.claude/skills/pickaxis/SKILL.md` | Proactive behavior the AI follows | This is soft guidance the AI may follow inconsistently — for deterministic behavior use a Claude Code hook. |
| `.claude/settings.local.json` `hooks.*` | Claude Code hooks (deterministic shell-callouts). Local rather than committed — see §2.8 for why. | Merge-safe write — preserve other hooks already present. |

### 2.8 Claude Code 2.x hook gotchas (load-bearing — three things must all be right)

Discovered the hard way during the first live test in `backend-poc`. The SessionStart hook ran clean on the CLI but didn't surface in Claude Code. Three separate Claude Code 2.x behaviors each had to be handled:

1. **Approval gate.** Hooks in committed `.claude/settings.json` require **explicit per-user approval** before they fire. Without approval, the hook silently no-ops. We write hooks to `.claude/settings.local.json` instead — per-user, gitignored, auto-active. (Permitted because the greeting is intrinsically personal anyway: it shows the dev's own private profile.)
2. **Output shape.** Plain stdout from a hook is folded **silently into the model's context** — the user never sees it. To produce a visible chat notice the hook must emit `{"systemMessage": "..."}` JSON. `additionalContext` (inside `hookSpecificOutput`) is model-only. `src/hooks/sessionStart.ts` writes the JSON form.
3. **npx race.** When both the MCP server (in `.mcp.json`) and the SessionStart hook use `npx -y github:girleadan/pickaxis#main …`, they target the same npx cache slot and race during population on first launch → `npm error code ENOTEMPTY`. Fix: when init runs from a stable on-disk install, write an **absolute path** to `dist/init/cli.js` for the hook command. The MCP server keeps the `npx -y <spec>` form (so `.mcp.json` stays portable), and the hook is per-user anyway so absolute paths are fine there.

Any new hook handler we add (Round 2 `UserPromptSubmit`/`Stop` etc.) must honor all three: register in `settings.local.json`, emit JSON when a visible notice is intended, and use the absolute-path form whenever PACKAGE_ROOT is stable.

---

## 3. Architecture (one-line pointers, no duplication)

The architectural summary every Claude Code session needs is in [`../CLAUDE.md`](../CLAUDE.md). The daily-use guide is in [`usage.md`](usage.md). For writing a pack, see [`pack-authoring.md`](pack-authoring.md). For install details and troubleshooting, see [`getting-started.md`](getting-started.md).

---

## 4. Shipped chronology

Each entry: **what shipped · why we built it · the commit**.

| # | Date | Commit | What | Why |
| --- | --- | --- | --- | --- |
| 1 | 2026-05-26 | `93d9bfb` | Initial scaffold: MCP server (8 tools), init CLI, profile store, 2 seed packs (polyglot, shopware-php), skill bundle. | Foundation. The piggyback model from §2.1 means almost everything is an MCP tool that returns instructions; this scaffold proved the model works. |
| 2 | 2026-05-26 | `8d9637e` | MIT LICENSE file. | `package.json` claimed MIT but no LICENSE file existed — GitHub showed "No license." |
| 3 | 2026-05-26 | `768d0be` | `docs/getting-started.md` + `prepare` script (`npm run build` post-install). | Without `prepare`, GitHub installs failed: `dist/` is in `.gitignore`, so `npx github:…` cloned the repo with no built bin. The `prepare` script makes git-installs build automatically. |
| 4 | 2026-05-26 | `995d8f3` | `init` auto-detects the git-install spec via `package.json` `_from`. | Without it, init wrote `npx -y pickaxis --mcp` into `.mcp.json`, which 404s against npm. |
| 5 | 2026-05-26 | `0e5ff63` | Walk parent directories to find the git spec (npm 10 dropped `_from`). | npm 10+ no longer writes `_from`/`_resolved` to installed package.json. We now walk up to the synthetic `package.json` npx creates and read the dep value there. |
| 6 | 2026-05-26 | `f19a116` | Slash commands moved from `.claude/skills/pickaxis/commands/` to `.claude/commands/`. | Claude Code doesn't scan a skill folder's nested `commands/` subdir — only `.claude/commands/`. Critical layout fix. |
| 7 | 2026-05-26 | `ab8ad72` | MCP server registered in `.mcp.json` at repo root, not `.claude/settings.json`. | An `mcpServers` block inside `settings.json` is silently ignored by Claude Code. The server has to live in `.mcp.json`. |
| 8 | 2026-05-27 | `14369e6` | **Assessment history + module-scoped assessment.** New `assessment_history` and `assess_module_start` tools; new `/px-review` and `/px-assess-module` slash commands. `assess_answer` now persists full `AssessmentRecord` to `assessments.jsonl` + human-readable `assessment-log.md`. | The original `assess_answer` only wrote `"questionId:outcome"` to a thin evidence log; the grader notes were overwritten on every answer. So "what did I get wrong last week" was unanswerable. Same commit added `assess_module_start` to drive code-grounded quizzes on a specific area; `bumpModule` finally populates per-module familiarity. |
| 9 | 2026-05-27 | `f8cee37` | **Code-grounded questions for gap axes.** New `src/assessment/axisProbes.ts` (`probeFilesForAxis`); when an axis has no curated question, `assess_start` returns a `mode:"dynamic"` block with axis-relevant files. | The user did an assessment in `backend-poc` and noticed that `language`, `framework`, `codebase`, `business` had "no question packs installed." Rather than hand-author packs for every stack (see §2.3), point the AI at the right files and let it generate questions. |
| 10 | 2026-05-27 | `b6bcafe` | **Blend + accurate scoring.** `assess_start` now returns one session block per axis with **both** the full curated pool **and** a project-specific probe. Continuous `Score` (back-compatible with integer profiles). New `applyAnswer` with the EMA scoring model from §2.5. | Each axis had only 1 curated question; the assessment was either curated *or* dynamic, never both. And the integer-level scoring rounded away every `partial` answer. This commit fixed both: questions are now blended (curated fundamentals + 1–2 project-grounded), and partials accumulate while harder questions push the score more. |
| 11 | 2026-05-27 | `aad4ada` | **General multi-stack detection.** New `src/assessment/stackDetect.ts` with file-extension census + framework signature registry; `readRepoSignals` aggregates manifests across the whole tree (not just root). | `backend-poc` was labeled "Node" because the only root manifest was a 3-line `package.json` with `vite` — even though the repo has 2,400 `.py` Django files under `src/www/`. Detection now walks the whole tree, runs a signature registry (Django, Symfony, Shopware, Laravel, Rails, React, Vue, Next, Go, …), and surfaces all stacks present. The dynamic question engine instantly improved for every project. |
| 12 | 2026-05-27 | `57a6f93` | `docs/usage.md` (full usage guide) + refreshed `README.md`. | The README's command table was stale (missing `/px-assess-module` and `/px-review`) and called the project "the initial scaffold." Users needed a real usage guide. |
| 13 | 2026-05-27 | `4c0694e` | `CLAUDE.md` for future Claude Code sessions. | Captures the non-obvious load-bearing design (piggyback model, scoring rules, install destinations, privacy stance) so a fresh Claude session can be productive without re-reading the journal. |
| 14 | 2026-05-27 | `e993a9b` | **Round 1 automation foundation.** New `src/config/` with `PickaxisConfig` (zod) + round-trip yaml; MCP tools `config_get` / `config_set` / `nudge_suggest`; `/px-config` slash command; `--hook` CLI dispatch + `SessionStart` hook; tightened SKILL.md (respect config, call `nudge_suggest`, stricter anti-cheese). All MCP tools short-circuit when `enabled: false` (the §2.6 invariant). | Until this, pickaxis was purely command-driven — no toggle, no proactive moments. Round 1 ships the substrate. Round 2 (the ticket loop with language lessons) will build on top. |
| 15 | 2026-05-27 | `1c96716` | **Project journal (this file)** + prominent pointers from `CLAUDE.md` and `README.md`. | One canonical "long memory" doc so future Claude Code sessions automatically discover the *why* behind every shipped feature, the load-bearing decisions, and the queued Round 2 spec. |
| 16 | 2026-05-27 | `bb98653` | **Round 1 audit fixes.** B1: `nudge_suggest` kind picker derived from a sha256 byte of the seed (was `seed.length`, collided across seeds). B2: nudge difficulty now computed from `displayLevel(score)+1` (was hardcoded `2`). B3: new `nudge_delivered` enum value on `EvidenceEvent.kind` (was logged as `ai_prompt`, semantically wrong). B4: `writeConfig` non-destructively merges missing Round-1 keys into existing `pickaxis.yaml` via `parseDocument` (was leaving old files untouched, hiding the new toggles). Plus C1/C2: extracted `weakestAxis` + `resolveRepoRoot` to `src/util/` (deduped). C5: `concept` nudge passes full focus instead of first sentence fragment. | Re-read the dispatch + init flow end-to-end before live testing. All four real bugs were small but high-leverage; the yaml merge alone makes the Round 1 toggles visible to anyone whose project was init'd pre-Round-1 (like `backend-poc`). |
| 17 | 2026-05-27 | `dd4bbe9` | **SessionStart hook moved from `.claude/settings.json` to `.claude/settings.local.json`.** | Claude Code 2.x gates hooks committed in `settings.json` behind explicit per-user approval — without approval they silently don't fire. The greeting is intrinsically personal anyway (shows the dev's own weakest axis from their private profile), so the per-user file is the semantically correct location *and* sidesteps the approval gate. See §2.8. |
| 18 | 2026-05-27 | `7169730` | **Hook output now emits `{"systemMessage": "..."}` JSON instead of plain stdout.** | Claude Code 2.x folds plain stdout from a `SessionStart` hook silently into the model's context — the user never sees it. For a visible chat notice, the hook must emit JSON with a top-level `systemMessage` field. (Confirmed via the claude-code-guide agent against `code.claude.com/docs/en/hooks.md`.) See §2.8. |
| 19 | 2026-05-27 | `6a543c0` | **`/px-config` drives the interactive flow via Claude's `AskUserQuestion` tool** (clickable picker instead of a free-text menu). | The previous doc had Claude print a numbered text menu and parse the user's typed reply. `AskUserQuestion` renders a real selectable option list with descriptions, multi-select for the feature toggles. Shortcut args (`/px-config disable`, `/px-config intensive`, …) still bypass the picker for instant toggles. |
| 20 | 2026-06-25 | `e641f8c` | **SessionStart hook command uses the absolute path to `dist/init/cli.js`** when init was run from a stable on-disk install; falls back to `npx -y <spec> --hook session-start` only when init itself ran from an npx cache (colleague-bootstrap path). | First Claude Code launch hit `npm error code ENOTEMPTY` — two `npx -y github:girleadan/pickaxis#main …` invocations fired simultaneously (one for the MCP server, one for the hook), racing during the same cache slot population. Since `settings.local.json` is per-user / gitignored, baking in an absolute path is fine and eliminates the race entirely for any local install. Colleagues installing fresh still get the npx form. See §2.8. |

---

## 5. The responsibilities pickaxis owns

| Responsibility | Status | Surface |
| --- | --- | --- |
| **Detect** | ✅ shipped | `src/assessment/stackDetect.ts`, `signals.ts`, `codemap/indexer.ts` |
| **Assess** | ✅ shipped | `assess_start`, `assess_module_start`, `assess_answer` |
| **Score** | ✅ shipped | `applyAnswer` (EMA, difficulty-weighted), profile store |
| **Prime** (before a ticket) | ✅ shipped | `ticket_prime` / `/px-prime` |
| **Practice** | ✅ shipped | `challenge_suggest` / `/px-challenge` |
| **Review** | ✅ shipped | `assessment_history` / `/px-review` |
| **Map** | ✅ shipped | `codemap_query` / `/px-map` |
| **Configure** | ✅ shipped (Round 1) | `pickaxis.yaml`, `config_get` / `config_set`, `/px-config` |
| **Nudge** (mid-work learning moments) | ✅ shipped (Round 1) | `nudge_suggest`, tightened SKILL.md, SessionStart hook |
| **Reflect** (after a ticket) | ⏭ Round 2 — spec locked, see §7 | `ticket_end_reflect` — *every ticket teaches one language thing* |
| **Curriculum / digest / anti-cheese enforcement** | ⏭ Round 3 | progression ladder, session digests, AI-vs-human authorship guard |

---

## 6. Queued and deferred work

### Round 2 — Ticket loop + language lessons (spec locked, see §7)

The closing move of every ticket is a **language lesson** (definition pinned in §7). Round 2 will ship:

- `lesson_suggest` MCP tool — returns the 4-part lesson block.
- Ticket-loop tools: `ticket_start`, `ticket_observe` (collects touched files), `ticket_end_reflect` (always calls `lesson_suggest` before returning — mandate enforced at the MCP layer).
- `/px-lesson` slash command for on-demand delivery between tickets.
- Pack contract addition: `Pack.lessons?: LessonContribution[]` (`{ language, difficulty, concept, explainer, check }`) — reserved slot, no curated lessons in v1.
- Hook wiring: `UserPromptSubmit` (detect ticket-like prompts; offer `/px-prime`) and `Stop` (close the loop with `ticket_end_reflect`).

### Round 3 — Polish

- **Curriculum ladder** — a soft "what's next?" progression per axis (L1 → L4 milestones) so the tool isn't just measuring but suggesting structured next steps.
- **Session digest** — wire the `Stop` hook to a short "today you touched X, learned Y" summary.
- **Anti-cheese guard** — enforce the SKILL.md guidance: when the dev accepts a lot of AI code without engaging, pickaxis should not bump their `codebase` score. This currently relies on the host AI honoring SKILL.md; Round 3 makes it enforceable.

### Deferred indefinitely (not yet decided when)

- **npm publish.** The name is on GitHub but not npm. Publishing locks the name permanently and forces a real release cadence — we want a few real users first.
- **`pickaxis.dev` domain registration + USPTO/EUIPO trademark search.** Both relevant only when announcing publicly. Domain check on 2026-05-26 showed `.dev`/`.io`/`.ai`/`.app` were free; `.com` was taken.
- **CI workflow.** `.github/workflows/` will land when there are real tests to run.

---

## 7. Locked spec — Language lesson (Round 2)

A **language lesson** is a 60-second, code-grounded teaching moment about the *programming language* the developer just used (not framework, not business logic). Four required parts:

| Part | What it is | Constraint |
| --- | --- | --- |
| **Concept** | One named idiom / feature / pitfall | One sentence |
| **Explainer** | 2 sentences + 1 code snippet | ≤ 8 lines of code |
| **Anchor** | One file from the dev's repo that uses (or notably should use) the concept | A path the dev can open |
| **Check** | One quick question with a hidden rubric | Answerable in ~30s |

The check flows through the existing dynamic `assess_answer` path (`axis: "language"`, the prompt, an estimated difficulty), so a lesson naturally bumps the language axis, lands in `assessments.jsonl` + `assessment-log.md`, and shows up in `/px-review` — no new recording machinery.

### What a lesson is NOT

- Not a generic concept nudge (those exist via `nudge_suggest {kind:"concept"}` and can be about any axis).
- Not a `/px-challenge` (broader/deeper deliberate practice).
- Not a `/px-assess-module` quiz (covers business+codebase+framework for a code area).
- Lessons are laser-focused on the **language** axis.

### Confirmed decisions

1. **Language scope:** the language of the **file(s) just touched** during the ticket. Falls back to `signals.primaryLanguage` if no relevant files. Polyglot-aware.
2. **Trigger:** end of ticket only — the mandate. Every ticket closes with one lesson. Also reachable on demand via `/px-lesson`. *Not* surfaced mid-work as a `nudge_suggest` variant — keeps lessons valuable, not noisy.
3. **Content source for v1:** LLM-generated, grounded in the dev's recently-touched files. Pack contract reserves a `LessonContribution` slot for future curated corpora. No curated lessons in v1.
4. **Difficulty:** `displayLevel(language.score) + 1` (clamped 1–4). L4 only reachable by getting harder lessons right.

### Storage + repetition guard

- New `~/.pickaxis/<fp>/lessons.jsonl`: `{ at, language, concept, anchorFile?, check, outcome?, scoreDelta, difficulty }`.
- "Don't repeat" rule: exclude concepts seen in the last 14 days (configurable later). Dedup key = lowercased `concept` string.
- Outcomes still land in `assessments.jsonl` via `assess_answer` (single source of truth). `lessons.jsonl` exists only for the repetition guard and a future `/px-lessons` history view.

---

## 8. Explicit non-goals (so future work doesn't drift)

- **No ML model training.** The host AI is the inference engine. See §2.1.
- **No manager dashboards, profile sync, or team aggregation.** Anti-surveillance is load-bearing. See §2.2.
- **No per-stack curated pack as the default response to "support X."** The dynamic engine covers any stack; packs are optional polish only. See §2.3.
- **No mcp config in `.claude/settings.json`** — Claude Code silently ignores `mcpServers` there. See §2.7.
- **No reintroduction of integer rounding** in `bumpAxis`/`bumpModule`/`applyAnswer`. Continuous scores are load-bearing. See §2.5.

---

## 9. References (don't duplicate; consult)

- [`../README.md`](../README.md) — motivation, install one-liner, command quick-reference.
- [`../CLAUDE.md`](../CLAUDE.md) — architectural summary for every Claude Code session.
- [`usage.md`](usage.md) — the daily-use guide.
- [`getting-started.md`](getting-started.md) — install, three paths, troubleshooting.
- [`pack-authoring.md`](pack-authoring.md) — write curated questions for a stack.
- GitHub: <https://github.com/girleadan/pickaxis>
- Commit log: `git log --oneline` (in this repo) — the implementation-step-by-step record.

---

## 10. How to update this journal

When you ship a feature:

1. Add a row to §4 with the commit hash, what shipped, and *why* (the problem it solved).
2. Update §5 — flip a row from "🆕" or "⏭" to ✅.
3. If the work shifted any locked decision in §2 or revealed a new non-goal in §8, update those sections.
4. If you completed a Round 2/3 item, update §6 and §7 accordingly.

The discipline: this journal explains *why* a future engineer would make the same decisions. Code explains *what*. Don't merge them.
