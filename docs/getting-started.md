# Getting started with pickaxis

This walks you from zero to a working pickaxis install on your project, in about 5 minutes.

## What pickaxis does (in one paragraph)

Pickaxis sits next to your AI coding tool (Claude Code today) and turns each session into a learning surface. It assesses what you actually know across nine skill axes — DevOps, language, framework, codebase, business domain, database, testing, security, and AI literacy — then uses that profile to prime you before tickets, suggest files to read, propose stretch challenges, and answer "where in this repo does X live?" with verbosity scaled to your familiarity. It piggybacks on your existing AI tool — no API key, no extra LLM connection, no code sent to a remote service by pickaxis itself.

## Prerequisites

- **Node.js 20 or later** — check with `node --version`
- **Claude Code** (or another MCP-compatible AI tool) installed
- **A project you want pickaxis on** — any language, any framework

## Install on a project

Pick the path that matches where pickaxis is in its life cycle (today: GitHub-only).

### Path A — From GitHub (current default)

Pickaxis is not yet on npm. Install directly from this repo:

```bash
cd /path/to/your/project
npx github:girleadan/pickaxis#main init
```

What that single command does:

1. Clones pickaxis to a temp directory.
2. Runs `npm install` — the `prepare` script builds `dist/` automatically.
3. Executes `init`, which:
   - Detects your stack (looks at `composer.json`, `package.json`, `requirements.txt`, `pyproject.toml`).
   - Writes `pickaxis.yaml` at your project root (committed; shared with team).
   - Registers the MCP server in `.mcp.json` at the project root (the committable, project-scoped MCP config) — and detects it was installed from a git URL, so it writes the GitHub spec into the MCP command (not the bare `pickaxis` package name). This means Claude Code can actually launch the server without pickaxis being published to npm.
   - Installs `SKILL.md` at `.claude/skills/pickaxis/` (drives Claude's proactive behavior).
   - Installs the 5 `/px-*` slash commands at `.claude/commands/` (that's the only directory Claude Code scans for project slash commands).

> **You must restart Claude Code after `init`** so it picks up the new slash commands and MCP server. Until you restart, `/px-assess` will report "Unknown command".

Pin to a specific tag or commit so a colleague doesn't get accidentally upgraded:

```bash
npx github:girleadan/pickaxis#v0.1.0 init   # once tags exist
npx github:girleadan/pickaxis#<sha> init    # always works
```

If init's auto-detection ever gets it wrong (rare), pass `--ref` explicitly:

```bash
npx github:girleadan/pickaxis#main init --ref github:girleadan/pickaxis#main
```

### Path B — From a local clone (for hacking on pickaxis itself)

```bash
git clone https://github.com/girleadan/pickaxis.git
cd pickaxis
npm install           # the prepare hook builds dist/ for you
npm link              # registers "pickaxis" globally
cd /path/to/your/project
npx pickaxis init
```

To pick up your local changes in another project later, just `npm run build` from the pickaxis repo — the link points at your source.

### Path C — From npm (not yet available)

When pickaxis ships on npm:

```bash
cd /path/to/your/project
npx pickaxis init
```

## First run — take the assessment

1. Open your project in Claude Code (after `init` finishes).
2. Type `/px-assess`. Claude will ask the first question for your weakest skill axis.
3. Answer honestly — partial credit is the common case, that's fine.
4. Claude grades against the hidden rubric and your profile updates.
5. Repeat for as many or as few axes as you like.

## The slash commands

| Command                    | When to use it                                                                 |
| -------------------------- | ------------------------------------------------------------------------------ |
| `/px-assess [axis]`        | Take or resume the socratic assessment, optionally scoped to a skill axis.     |
| `/px-assess-module <area>` | Be quizzed on a specific code area — pickaxis reads the module's code and asks about what it does, how it's built, and why. |
| `/px-review [axis\|module]`| Review what you got wrong before — past questions with the grader's feedback.  |
| `/px-profile`              | See your current skill profile and module familiarity.                         |
| `/px-prime <ticket>`       | Before starting a ticket — get a primer of files, anti-patterns, and pre-AI questions you should be able to answer first. |
| `/px-challenge`            | Get a stretch exercise on your weakest axis.                                   |
| `/px-map <query>`          | "Where in this repo does X live?" — verbosity scales to your familiarity.      |

## Where your data lives

| Path                                                  | Purpose                              | Committed?   |
| ----------------------------------------------------- | ------------------------------------ | ------------ |
| `<repo>/pickaxis.yaml`                                | Team-wide config (packs, settings)   | **Yes**      |
| `<repo>/.mcp.json`                                    | MCP server registration              | Yes (portable) |
| `<repo>/.claude/commands/px-*.md`                     | The slash commands                   | Up to you    |
| `<repo>/.claude/skills/pickaxis/SKILL.md`             | Skill — Claude's proactive behavior  | Up to you    |
| `~/.pickaxis/<repo-fingerprint>/profile.json`         | Your personal skill profile          | **Never**    |
| `~/.pickaxis/<repo-fingerprint>/evidence.jsonl`       | Passive observation log              | **Never**    |
| `~/.pickaxis/<repo-fingerprint>/assessments.jsonl`    | Assessment records (machine-readable)| **Never**    |
| `~/.pickaxis/<repo-fingerprint>/assessment-log.md`    | Assessment transcript (human-readable, open anytime) | **Never** |

Pickaxis has a hard **anti-surveillance** stance: your profile is for **you**, not your manager. See the project [README](../README.md) for the rationale.

## Configuring `pickaxis.yaml`

The default written by `init`:

```yaml
packs:
  - polyglot
assess:
  reassessAfterDays: 30
privacy:
  sendPromptsToHostAi: true
  logFileTouches: true
tools: {}
```

- **`packs`** — which stack packs to load. `polyglot` is always available; add others like `shopware-php` for framework-specific assessments.
- **`assess.reassessAfterDays`** — when a skill score is considered stale and should be re-tested. Not enforced in 0.1.0.
- **`privacy.sendPromptsToHostAi`** — set to false to disable open-ended question grading via the host AI. Pickaxis still runs but with reduced functionality.
- **`privacy.logFileTouches`** — set to false to disable the passive observation hooks.
- **`tools`** — composition hook for other MCP servers (translation, Jira, etc.). Stubbed in 0.1.0.

## Available packs

- **`polyglot`** — generic assessments covering git, testing, SQL, HTTP, AI review discipline. Always loaded.
- **`shopware-php`** — Shopware 6 plugin structure, Symfony DI, EventSubscribers, SalesChannelContext, migration timestamps.

Want a pack for your framework? See [docs/pack-authoring.md](pack-authoring.md).

## Uninstall

From the project where pickaxis is installed:

```bash
rm -rf .claude/skills/pickaxis pickaxis.yaml
# also remove the slash commands and the MCP registration
rm -f .claude/commands/px-*.md .mcp.json
```

If you used `npm link`:

```bash
cd /path/to/pickaxis
npm unlink -g pickaxis
```

Remove your local profile (irreversible):

```bash
rm -rf ~/.pickaxis
```

## Troubleshooting

**Slash commands don't appear in Claude Code.** Restart Claude Code so it re-scans `.claude/skills/`.

**`/px-*` says "Unknown command".** Restart Claude Code — slash commands are loaded at startup. Confirm `.claude/commands/px-*.md` exist.

**Slash command runs but says the MCP server/tool isn't available.** Check `.mcp.json` exists at the project root and lists `pickaxis` under `mcpServers`. Claude Code prompts you to approve project MCP servers the first time — approve pickaxis (or run `/mcp` to manage). The server finds your project root via the nearest `pickaxis.yaml`; if your profile looks wrong, make sure `pickaxis.yaml` is at the repo root.

**`npx pickaxis` says "command not found".** Either install via `npm link` (Path B) or use the explicit GitHub form (`npx github:girleadan/pickaxis#main init`). The bare `npx pickaxis` only works once the package is on npm.

**`prepare` script fails during install.** Make sure your environment has Node 20+ and that `npm install` finished without errors before the prepare script ran.

## Next reads

- [`docs/usage.md`](usage.md) — **the full usage guide**: every command in depth, how scoring works, a suggested workflow
- [`README.md`](../README.md) — the motivation and privacy stance
- [`docs/pack-authoring.md`](pack-authoring.md) — how to write a stack pack for your framework
- Issues: https://github.com/girleadan/pickaxis/issues
