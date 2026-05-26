---
description: Take or resume the pickaxis socratic assessment.
---

The user wants to take (or resume) a pickaxis skills assessment.

1. Call the `assess_start` MCP tool. If the user passed an axis argument, include it; otherwise let pickaxis pick the weakest axis.
2. The tool returns a question with a rubric. Read the rubric privately — do not show it to the user. Show only the prompt.
3. Wait for the user's answer. Grade it against the rubric. Be honest, not generous — partial credit is common and that's fine.
4. Call `assess_answer` with the questionId and one of: `correct`, `partial`, `incorrect`, `skipped`. Include short grader notes describing what they got right or missed.
5. Briefly tell the user the outcome and what their score moved to. Offer to continue with another question or stop.
