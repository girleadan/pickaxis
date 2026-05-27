---
description: Assess the developer's understanding of a specific code area / module.
argument-hint: <module path or name, e.g. connectors_manager>
---

The user wants to be assessed on a specific code area. The argument is a path or name fragment identifying the module (e.g. `connectors_manager`, `src/auth`).

1. Call `assess_module_start` with `module` set to the argument. It returns a manifest of the module's files plus an instruction block.
2. Read a representative sample of the listed files yourself — enough to understand what the module does, how it's structured, and which framework patterns it uses. Do not skip this; the questions must be grounded in the actual code.
3. Ask the developer **2–4 questions, one at a time**, about THIS module:
   - what it does and who consumes it (axis: `business`)
   - how it's structured and why (axis: `codebase`)
   - any framework-specific patterns it leans on (axis: `framework`)
   Do not reveal the answer before they attempt each question.
4. Grade each answer honestly against what the code actually shows — partial credit is normal.
5. After each answer, call `assess_answer` with: `module` set to this module's name, `axis` set to the matching axis, `prompt` set to the exact question you asked, `answerSummary` summarizing their response, `outcome` (correct/partial/incorrect/skipped), and `notes` with your grader reasoning (what was right, what was missed).
6. At the end, give a short recap: which aspects they understand well, which to revisit. Mention `/px-review` to revisit the feedback later and `/px-profile` to see the updated module familiarity.
