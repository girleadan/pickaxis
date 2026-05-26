---
description: Prime the developer for a ticket before they start prompting the AI.
argument-hint: <ticket title or short description>
---

The user is about to start work on a ticket. The argument is the ticket title or short description.

1. Call `ticket_prime` with `ticket` set to the argument.
2. The tool returns a focus axis, anti-patterns to watch for, and an instruction. Use it as a planning guide.
3. Call `codemap_query` with keywords distilled from the ticket to surface 3–6 files the developer should read first.
4. Present a tight briefing to the user:
   - 3–6 files to read first (paths, one-line "why this one")
   - 1–3 anti-patterns from the primer to watch for in any AI output they accept
   - 1–2 pre-AI questions the developer should be able to answer themselves before prompting the AI

Keep the briefing under ~15 lines. The goal is to anchor the developer in the codebase, not to summarize it.
