---
description: Take or resume the pickaxis socratic assessment.
argument-hint: "[skill axis, e.g. database] (optional)"
---

The user wants to take (or resume) a pickaxis skills assessment, scoped to a **skill axis**.

If instead they want to be assessed on a **specific code area / module** (e.g. `connectors_manager`), use `/px-assess-module <area>` — that reads the module's code and quizzes them on it.

1. Call the `assess_start` MCP tool. If the user passed an axis argument (devops, language, framework, codebase, business, database, testing, security, ai_literacy), include it; otherwise let pickaxis pick the weakest axis.
2. The response is one of two shapes — handle both:

   **(a) Static question** — the response has a `question` object with a `rubric`. Read the rubric privately (don't show it). Show only the prompt. After the user answers, grade against the rubric and call `assess_answer` with the `questionId`, the `outcome` (`correct`/`partial`/`incorrect`/`skipped`), grader reasoning in `notes`, and a short `answerSummary`.

   **(b) Dynamic** — the response has `mode: "dynamic"`, a `focus` note, and a list of `files`. There's no curated question pool for this axis, so generate your own: read a representative sample of the listed files, then create 2–4 questions grounded in what THIS codebase actually does/uses (guided by `focus`). Ask one at a time; don't reveal answers first. Grade each honestly, then record via `assess_answer` with **`axis`** set to this axis and **`prompt`** set to the exact question you asked (no `questionId`), plus `answerSummary`, `outcome`, and `notes`.

3. Be honest, not generous — partial credit is common and that's fine.
4. Briefly tell the user each outcome and what their score moved to. Offer to continue or stop, and mention `/px-review` to revisit feedback later.
