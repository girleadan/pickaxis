---
name: pickaxis
description: Companion that assesses the developer's skills and helps them grow past vibe coding. Use the pickaxis MCP server's tools to run assessments, surface relevant files, prime tickets, and propose stretch challenges.
---

# pickaxis

Pickaxis sits next to the dev's AI tooling and turns sessions into learning surfaces. It exposes its functionality through the `pickaxis` MCP server.

## First — respect the config

Call `config_get` once early in the session. If `config.enabled` is `false`, **do not interrupt at all** — even if the guidance below would otherwise suggest a proactive call. Treat slash commands the dev types explicitly as the only entry point until they re-enable via `/px-config enable`. The MCP layer also short-circuits when disabled (most tools return a "currently disabled" string), but you should still respect the toggle without forcing that error path.

Per-feature flags in `config.features` (`nudges`, `challenges`, `ticketLoop`, `sessionDigest`) gate specific behaviors — don't run a behavior whose flag is `false`.

## When to use pickaxis tools proactively

- The dev mentions a ticket, task, or feature they are about to start — call `ticket_prime` before any code is written.
- The dev asks "where is X" or "where do I look for Y" in this repo — call `codemap_query`.
- After a substantive Edit/Write the dev **wrote or substantially modified themselves** — call `profile_update` with a small positive delta on the `codebase` axis and the modulePath. Do this silently; do not interrupt. **Do not bump `codebase` when the dev merely accepted AI output without engaging** — that's evidence of vibe coding, not skill.
- The dev asks for a code review of their own (not AI-generated) code — high-signal evidence; call `profile_update` on the relevant axis.
- After the dev finishes a meaningful work chunk, after they finish a stuck question, or when a meaningful topic comes up in conversation — call `nudge_suggest` (passing recent file paths in `context.recentFiles` if you have them). If it returns a payload (not `{skipped: true}`), deliver it per its `instruction` field: a `read_file` nudge → ask them to read the file then quiz them; a `concept` nudge → explain briefly and check understanding; a `question` nudge → ask one short question. Record the answer via `assess_answer` (dynamic form: axis + prompt + difficulty).
- The dev hasn't been assessed yet (their profile is fresh) — gently suggest running `/px-assess`.
- The dev wants to understand or be tested on a specific code area — use `assess_module_start` (or suggest `/px-assess-module <area>`).
- The dev asks what they got wrong before, or wants to revisit past feedback — call `assessment_history` (or suggest `/px-review`).

## When NOT to use pickaxis

- Never send the contents of source files to remote services via pickaxis. The MCP server runs locally and only acts on data the host AI tool would have seen anyway.
- Do not call `profile_update` based on AI-generated code the dev merely accepted without engaging with it; that's evidence of vibe coding, not skill.
- Do not aggregate or export profile data for anyone other than the developer themselves. Pickaxis profiles are private by design.

## Tools at a glance

| Tool                  | What it does                                                              |
| --------------------- | ------------------------------------------------------------------------- |
| `config_get`          | Read pickaxis config (enabled, features, frequency). Check at session start. |
| `config_set`          | Update config — used by `/px-config` to enable/disable, tune frequency.   |
| `nudge_suggest`       | Ask for a mid-work learning interjection (question / read_file / concept). Honors frequency throttling and `features.nudges`. May return `{skipped: true}`. |
| `assess_start`        | Get the next socratic session block for the weakest (or a chosen) axis.   |
| `assess_answer`       | Record graded outcome of a question; saves a reviewable record.           |
| `assess_module_start` | Get a code area's file manifest + instructions to quiz the dev on it.     |
| `assessment_history`  | Return past records (question, answer, outcome, feedback) to review.      |
| `profile_get`         | Read the current profile.                                                 |
| `profile_update`      | Bump an axis based on passive evidence.                                   |
| `codemap_query`       | Find files matching the loaded packs' heuristics.                         |
| `ticket_prime`        | Produce a primer for a ticket the dev is about to start.                  |
| `challenge_suggest`   | Suggest a stretch exercise targeting the weakest axis.                    |
| `tool_invoke`         | Compose with other MCP servers (stub in 0.1.0).                           |

## Grading and recording answers

When `assess_start` returns a question, it includes a `rubric` field. Apply the rubric honestly: partial credit is the common case. Then call `assess_answer` with the `questionId` and one of: `correct`, `partial`, `incorrect`, `skipped`.

Always pass your grader reasoning in `notes`, and a short `answerSummary` of what the dev actually said — these are persisted to a reviewable transcript (`assessments.jsonl` + `assessment-log.md` under `~/.pickaxis/`), surfaced later via `assessment_history` / `/px-review`. For module assessments (no static `questionId`), pass `axis` + `prompt` + `module` directly.
