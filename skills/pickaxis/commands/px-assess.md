---
description: Take or resume the pickaxis socratic assessment.
argument-hint: "[skill axis, e.g. database] (optional)"
---

The user wants to take (or resume) a pickaxis skills assessment, scoped to a **skill axis**.

If instead they want to be assessed on a **specific code area / module** (e.g. `connectors_manager`), use `/px-assess-module <area>` — that reads the module's code and quizzes them on it.

1. Call the `assess_start` MCP tool. If the user passed an axis argument (devops, language, framework, codebase, business, database, testing, security, ai_literacy), include it; otherwise let pickaxis pick the weakest axis.
2. The response is one unified session block: `{ axis, curated: [...], projectSpecific: {focus, files} | null, instruction }`. Run it in this order:

   **First — curated questions** (`curated[]`, may be empty): for each, read its `rubric` privately (never show it), show only the `prompt`, wait for the answer, grade against the rubric, then call `assess_answer` with the `questionId`, the `outcome` (`correct`/`partial`/`incorrect`/`skipped`), a short `answerSummary`, and grader reasoning in `notes`. (Difficulty is taken from the question automatically.)

   **Then — project-specific questions** (if `projectSpecific` is present): read a representative sample of `projectSpecific.files`, then ask **1–2** questions about how THIS project handles the axis, guided by `projectSpecific.focus`. Grade each, then record via `assess_answer` with **`axis`** set to this axis, **`prompt`** set to the exact question you asked (no `questionId`), a **`difficulty`** estimate 0–4 (be honest — only hard questions can push a score toward expert), plus `answerSummary`, `outcome`, `notes`.

3. Ask one question at a time; never reveal the answer first. Be honest, not generous — partial credit is common.
4. After each answer, briefly tell the user the outcome and the new score. At the end, offer to continue or stop and mention `/px-review` to revisit feedback later.
