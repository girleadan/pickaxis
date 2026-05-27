---
description: Take or resume the pickaxis socratic assessment.
argument-hint: "[skill axis, e.g. database] (optional)"
---

The user wants to take (or resume) a pickaxis skills assessment, scoped to a **skill axis**.

If instead they want to be assessed on a **specific code area / module** (e.g. `connectors_manager`), use `/px-assess-module <area>` — that reads the module's code and quizzes them on it.

1. Call the `assess_start` MCP tool. If the user passed an axis argument (devops, language, framework, codebase, business, database, testing, security, ai_literacy), include it; otherwise let pickaxis pick the weakest axis.
2. The tool returns a question with a rubric. Read the rubric privately — do not show it to the user. Show only the prompt.
3. Wait for the user's answer. Grade it against the rubric. Be honest, not generous — partial credit is common and that's fine.
4. Call `assess_answer` with the `questionId` and one of: `correct`, `partial`, `incorrect`, `skipped`. Put your grader reasoning in `notes` (what they got right or missed) — this is saved and reviewable later via `/px-review`. Optionally pass `answerSummary` with a short summary of what they actually said.
5. Briefly tell the user the outcome and what their score moved to. Offer to continue with another question or stop, and mention `/px-review` to revisit feedback later.
