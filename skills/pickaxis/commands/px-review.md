---
description: Review what you got wrong in past pickaxis assessments.
argument-hint: "[axis or module name] (optional filter)"
---

The user wants to review past assessment results — what they got wrong or partially wrong.

1. Call the `assessment_history` MCP tool. By default it returns `incorrect` + `partial` outcomes, newest first. If the user passed an argument that matches a skill axis (devops, language, framework, codebase, business, database, testing, security, ai_literacy), pass it as `axis`; otherwise pass it as `module`.
2. The tool returns records (each with the question prompt, the user's answer summary, the outcome, and the grader's feedback) plus a `logFile` path.
3. Present the results grouped by axis (and by module where present). For each item show:
   - the question
   - what they answered (answerSummary)
   - the grader feedback
   - one line on what a strong answer covers
4. Keep it scannable — a short grouped list, not a wall of text. End by telling the user they can open the full transcript at the `logFile` path, and suggest `/px-challenge` or `/px-assess-module <area>` to work on a weak spot.

If there are no records yet, say so plainly and point them at `/px-assess` or `/px-assess-module`.
