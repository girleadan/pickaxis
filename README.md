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

Pickaxis is not on npm yet — install directly from GitHub:

```bash
cd your-project
npx github:girleadan/pickaxis#main init
```

Then in Claude Code, run `/px-assess` to take the initial 5–10 minute assessment.

**New here?** Read the **[full usage guide](docs/usage.md)**. For installation details (local clone, npm-link dev setup, troubleshooting) see **[getting-started.md](docs/getting-started.md)**. For the project's design history, decisions, and queued work, see **[docs/journal.md](docs/journal.md)**.

## Slash commands (in Claude Code)

| Command | What it does |
| --- | --- |
| `/px-assess [axis]` | Assess a skill axis (your weakest if you don't name one) — curated questions plus questions generated from your own code. |
| `/px-assess-module <area>` | Assess a specific code area; pickaxis reads that module and quizzes you on it. |
| `/px-review [axis\|module]` | Review what you got wrong/partial before, with the grader's feedback. |
| `/px-profile` | Show your current skill profile and module familiarity. |
| `/px-prime <ticket>` | Before a ticket: where to look, what to watch for, what to know first. |
| `/px-challenge` | A stretch exercise targeting your weakest axis. |
| `/px-map <query>` | "Where in this repo does X live?" — detail scales to your familiarity. |
| `/px-config [enable\|disable\|quiet\|intensive]` | Turn pickaxis on/off, change how often it interjects, toggle features. |

See **[docs/usage.md](docs/usage.md)** for what each command does in depth, how scoring works, and a suggested workflow.

## How it works

Pickaxis recognizes any project's languages and frameworks automatically (Django, Symfony, React, Go, Rails, …) and assesses them with a mix of curated questions and questions generated from your actual code — so you don't need a hand-written pack per stack. Curated packs (`polyglot` always-on, `shopware-php` for Shopware) are an optional polish layer; see [docs/pack-authoring.md](docs/pack-authoring.md) to add your own.
