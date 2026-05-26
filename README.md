# pickaxis

> A companion for developers who vibe-code with AI. Assesses what you actually know, then helps you grow — not just ship.

AI coding tools let developers ship code they don't understand. **Pickaxis** sits next to your AI tool (Claude Code today, others soon) and turns every session into a learning surface: it maps what you know, primes you before tickets, surfaces the right files to read, and challenges you to reason about architecture instead of just accepting the AI's output.

The goal is not to replace your AI tool. The goal is to make sure you get **sharper**, not duller, with every commit.

---

## Privacy first — read this before anything else

Pickaxis's per-developer profile is for **you**, not for your manager.

- The profile lives in `~/.pickaxis/<repo-fingerprint>/` on your local machine.
- It is **never** committed to the repository.
- It is **never** sent to a remote service by pickaxis itself.
- Pickaxis piggybacks on whatever AI tool you already trust (e.g. Claude Code). It does not bring its own LLM connection. The only data that reaches any external service is data your existing AI tool would have seen anyway.
- The repo-level `pickaxis.yaml` (config — which packs to load, which categories to assess) **is** committed, because it benefits the whole team. The profile is not.

If your team tries to pipe profiles into a management dashboard, that is a fork, not pickaxis. We will not ship that feature.

---

## Install

```bash
cd your-project
npx pickaxis init
```

Then in Claude Code, run `/px-assess` to take the initial 5–10 minute assessment.

## Slash commands (in Claude Code)

| Command          | What it does                                                                 |
| ---------------- | ---------------------------------------------------------------------------- |
| `/px-assess`     | Run (or resume) a socratic assessment across all skill axes.                 |
| `/px-profile`    | Show your current skill profile and knowledge map.                           |
| `/px-prime <t>`  | Given a ticket title/description, suggest where to look and what to read.    |
| `/px-challenge`  | Suggest a stretch exercise targeting your weakest axis.                      |
| `/px-map <q>`    | "Where in this repo does X live?" — verbosity scales to your familiarity.    |

## Status

This is the initial scaffold. The MCP server boots, tools are registered with real schemas, and the init flow works end-to-end. Assessment logic and stack packs are minimal seeds — see [docs/pack-authoring.md](docs/pack-authoring.md) for how the system is meant to expand.
