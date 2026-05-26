---
description: Ask pickaxis where in the repo something lives.
argument-hint: <natural-language query like "where does pricing logic live?">
---

The user is asking where in the codebase something is.

1. Call `codemap_query` with `query` set to the argument.
2. The tool returns labeled file paths with one-line descriptions.
3. Also call `profile_get` to see the developer's familiarity with the relevant modules. Use this to decide verbosity:
   - Familiarity 0–1 (unknown / novice): point to the files AND give a 1–2 sentence orientation per file.
   - Familiarity 2 (familiar): point to the files with just the labels — no extra explanation.
   - Familiarity 3–4 (proficient / expert): give just the paths in a tight list, optionally noting one non-obvious file they might not know.

The point is to scale guidance to where the developer actually is. Do not over-explain to someone who knows the area, and do not under-explain to someone new.
