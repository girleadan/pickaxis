---
name: pickaxis
description: Companion that assesses the developer's skills and helps them grow past vibe coding. Use the pickaxis MCP server's tools to run assessments, surface relevant files, prime tickets, and propose stretch challenges.
---

# pickaxis

Pickaxis sits next to the dev's AI tooling and turns sessions into learning surfaces. It exposes its functionality through the `pickaxis` MCP server.

## When to use pickaxis tools proactively

- The dev mentions a ticket, task, or feature they are about to start — call `ticket_prime` before any code is written.
- The dev asks "where is X" or "where do I look for Y" in this repo — call `codemap_query`.
- The dev edits a file via Edit/Write — call `profile_update` with a small positive delta on the `codebase` axis and the modulePath. Do this in the background; do not interrupt the dev.
- The dev asks for a code review of their own (not AI-generated) code — note this is high-signal evidence; call `profile_update` on the relevant axis.
- The dev hasn't been assessed yet (their profile is fresh) — gently suggest running `/px-assess`.

## When NOT to use pickaxis

- Never send the contents of source files to remote services via pickaxis. The MCP server runs locally and only acts on data the host AI tool would have seen anyway.
- Do not call `profile_update` based on AI-generated code the dev merely accepted without engaging with it; that's evidence of vibe coding, not skill.
- Do not aggregate or export profile data for anyone other than the developer themselves. Pickaxis profiles are private by design.

## Tools at a glance

| Tool                 | What it does                                                    |
| -------------------- | --------------------------------------------------------------- |
| `assess_start`       | Get the next socratic question for the weakest axis.            |
| `assess_answer`      | Record graded outcome of a question (correct/partial/etc).      |
| `profile_get`        | Read the current profile.                                       |
| `profile_update`     | Bump an axis based on passive evidence.                         |
| `codemap_query`      | Find files matching the loaded packs' heuristics.               |
| `ticket_prime`       | Produce a primer for a ticket the dev is about to start.        |
| `challenge_suggest`  | Suggest a stretch exercise targeting the weakest axis.          |
| `tool_invoke`        | Compose with other MCP servers (stub in 0.1.0).                 |

## Grading rubric format

When `assess_start` returns a question, it includes a `rubric` field. Apply the rubric honestly: partial credit is the common case. Then call `assess_answer` with one of: `correct`, `partial`, `incorrect`, `skipped`. Pass any relevant grader notes — they end up in the dev's evidence log.
