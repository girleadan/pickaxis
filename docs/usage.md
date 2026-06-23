# Using pickaxis

A complete guide to working with pickaxis day to day. If you haven't installed it yet, start with **[getting-started.md](getting-started.md)**; this guide assumes pickaxis is already running in your project.

---

## 1. What pickaxis is (and isn't)

Pickaxis sits next to your AI coding tool (Claude Code today) and turns each session into a learning surface. It:

- **Assesses** what you actually know across nine skill axes, using a mix of curated questions and questions generated from *your* codebase.
- **Tracks** a per-developer skill profile over time, with a transcript you can review.
- **Guides** you — primes you before a ticket, points at the right files, and sets stretch challenges on your weak spots.

What it is **not**:

- It's **not a grader for your manager.** Your profile is private, stored only on your machine, never committed, never sent anywhere by pickaxis. (See §8.)
- It's **not its own AI.** It piggybacks on the AI tool you already use — no API key, no extra model. The only data that leaves your machine is whatever your existing AI tool would have seen anyway.

### The nine skill axes

| Axis | What it covers |
| --- | --- |
| `devops` | CI, deploys, containers, infra, observability |
| `language` | Idioms, stdlib, error handling, pitfalls of the primary language |
| `framework` | The framework(s) the project is built on and their conventions |
| `codebase` | How *this* repo is organized — layering, where things live |
| `business` | What the product does, who uses it, the key domain flows |
| `database` | Schema, queries, migrations, the ORM patterns in use |
| `testing` | What's tested, at what level, with what tools |
| `security` | Input validation, authn/authz, secrets, OWASP-style risks |
| `ai_literacy` | Your ability to critique AI-generated code — the meta-skill |

Each axis carries a **continuous score from 0 to 4**, shown as a level:

| Score | Level | Meaning |
| --- | --- | --- |
| 0 | L0 | unknown |
| 1 | L1 | novice |
| 2 | L2 | familiar |
| 3 | L3 | proficient |
| 4 | L4 | expert |

The score is fractional under the hood (e.g. `2.7`) so progress within a level is visible and partial answers always count.

---

## 2. What pickaxis is responsible for

A clear separation of concerns, so it's obvious what to use when:

| Responsibility | What it does | Surface |
| --- | --- | --- |
| **Detect** | Identify the project's stacks, languages, and modules. | Automatic at install + on every tool call. |
| **Assess** | Quiz you on the 9 axes — curated questions + questions generated from your code. | `/px-assess`, `/px-assess-module` |
| **Score** | Maintain levels & confidence over time; harder questions move you more. | `/px-profile` |
| **Prime** | Before a ticket, point at the files and concepts you should know first. | `/px-prime <ticket>` |
| **Nudge** | Mid-work learning moments: an ad-hoc question, a file to read, or a quick concept. | Automatic when enabled |
| **Practice** | Deliberate exercises on your weakest axis. | `/px-challenge` |
| **Review** | Revisit what you got wrong, with the grader's feedback. | `/px-review` |
| **Map** | Navigate the repo by your own familiarity. | `/px-map <query>` |
| **Configure** | Turn pickaxis on/off, set frequency, toggle features. | `/px-config` |

Pickaxis itself doesn't "know" the codebase — it points the AI you already use at the right files at the right moment. Your skill profile is local; nothing is sent anywhere by pickaxis.

---

## 3. The commands

All commands are typed in Claude Code (project-scoped to wherever you ran `init`).

| Command | Purpose |
| --- | --- |
| `/px-assess [axis]` | Assess a skill axis (your weakest if you don't name one). |
| `/px-assess-module <area>` | Assess a specific code area — pickaxis reads that module and quizzes you on it. |
| `/px-review [axis\|module]` | Review what you got wrong/partial before, with the grader's feedback. |
| `/px-profile` | Show your current skill profile and module familiarity. |
| `/px-prime <ticket>` | Before starting a ticket: where to look, what to watch for, what to know first. |
| `/px-challenge` | A stretch exercise on your weakest axis. |
| `/px-map <query>` | "Where in this repo does X live?" — detail scales to your familiarity. |
| `/px-config [arg]` | View or change pickaxis config (enable/disable, frequency, features). |

---

## 4. Taking an assessment — `/px-assess`

```
/px-assess
```

With **no argument**, pickaxis picks your **weakest axis** and runs a short session for it. Run it again and it moves to the next-weakest, so repeated runs walk down your gaps.

```
/px-assess database
```

Name an axis to target it directly (`devops`, `language`, `framework`, `codebase`, `business`, `database`, `testing`, `security`, `ai_literacy`).

### What a session looks like

Each axis session has up to two parts, asked one question at a time:

1. **Curated questions** — vetted, difficulty-laddered questions from the loaded packs (e.g. the database axis includes an N+1 query question). Not every axis has these.
2. **Project-specific questions** — 1–2 questions generated from *your* code. Pickaxis points the AI at the files most relevant to the axis (your migrations for `database`, your framework config for `framework`, etc.) and it asks about how *this* project actually works.

So a `database` assessment might ask the general N+1 question, then "walk me through how `Order` and `LineItem` are related in this schema and where the N+1 risk is in the current code."

Answer honestly — **partial credit is normal and expected.** The grader is told to be honest, not generous. Every answer is recorded (see §5) so you can revisit it.

---

## 5. Assessing a specific area — `/px-assess-module`

```
/px-assess-module connectors_manager
/px-assess-module src/auth
```

Give it a directory or name fragment. Pickaxis enumerates that module's files and the AI reads them, then asks 2–4 questions about:

- **What** the module does and who consumes it (counts toward `business`)
- **How** it's structured and why (counts toward `codebase`)
- Any **framework patterns** it relies on (counts toward `framework`)

This is the best way to ramp up on an unfamiliar part of a codebase: it forces you to read and reason about real code, and it records your familiarity per module (visible in `/px-profile`).

---

## 6. Reviewing past results — `/px-review`

```
/px-review
/px-review database
/px-review connectors_manager
```

Every answer you give is saved with the question, a summary of your answer, the outcome, and the grader's reasoning. `/px-review` surfaces them — by default the **incorrect and partial** ones, since those are what's worth revisiting — grouped by axis (and module).

With an argument it filters to a specific axis or module.

There's also a **human-readable transcript** you can open in any editor, outside Claude:

```
~/.pickaxis/<repo-fingerprint>/assessment-log.md
```

Each entry has the date, axis/module, outcome, the question, your answer, and the feedback.

---

## 7. Seeing your profile — `/px-profile`

```
/px-profile
```

Shows every axis with its level, raw score, and confidence, plus per-module familiarity. Example:

```
Skill axes:
  devops         L0 (score 0.0, conf 0.10)
  language       L1 (score 1.0, conf 0.12)
  ...
  database       L3 (score 2.7, conf 0.62)

Module familiarity:
  L2 (score 1.8)  connectors_manager  (0 edits)
```

- **score** — the continuous value behind the level; watch it climb within a level.
- **confidence** — rises as you answer more questions on that axis; low confidence means "not much signal yet."

### How scoring works

Pickaxis nudges each axis score toward a **target based on the question's difficulty**:

- A **correct** answer pulls the score toward `difficulty + 1`.
- A **partial** pulls toward the question's difficulty.
- An **incorrect** pulls down toward `difficulty − 1`.

Consequences worth knowing:

- **Partial answers always move the needle** (no rounding away).
- **Harder questions move you more.** Reaching L4 *requires* getting genuinely hard (difficulty 3–4) questions right — you can't ace your way to expert on easy questions. The project-specific questions are where that depth comes from.
- A few answers converge the score; it's an estimate, not a tally.

---

## 8. The growth tools

### `/px-prime <ticket>` — before you start work

```
/px-prime "Add a customer-group filter to the product listing API"
```

Instead of immediately prompting the AI to write the code, run this first. Pickaxis returns a briefing: the modules/files to read, anti-patterns to watch for in any AI output, and a couple of questions you should be able to answer *before* you prompt. The point is to enter the task with a map, not a blank stare.

### `/px-challenge` — deliberate practice

```
/px-challenge
```

Picks your weakest axis and sets a stretch exercise — a design/refactor/test/debugging prompt grounded in the repo. Then it suggests one concrete next step to keep improving.

### `/px-map <query>` — navigate the repo

```
/px-map "where does pricing logic live?"
```

Answers "where is X" using the loaded packs' heuristics. The **verbosity adapts to your familiarity**: if you're new to that area you get orientation per file; if you already know it you just get the paths.

---

## 9. Where your data lives (and privacy)

| Path | Purpose | Committed? |
| --- | --- | --- |
| `<repo>/pickaxis.yaml` | Team config (packs, settings) | **Yes** |
| `<repo>/.mcp.json` | MCP server registration | Yes (portable) |
| `<repo>/.claude/commands/px-*.md` | The slash commands | Up to you |
| `<repo>/.claude/skills/pickaxis/SKILL.md` | Claude's proactive behavior | Up to you |
| `~/.pickaxis/<repo-fingerprint>/profile.json` | Your skill profile | **Never** |
| `~/.pickaxis/<repo-fingerprint>/assessments.jsonl` | Machine-readable answer records | **Never** |
| `~/.pickaxis/<repo-fingerprint>/assessment-log.md` | Human-readable transcript | **Never** |
| `~/.pickaxis/<repo-fingerprint>/evidence.jsonl` | Passive-observation signals | **Never** |

The `<repo-fingerprint>` is a hash of the project's absolute path, so each project gets its own profile and different developers on the same repo keep separate profiles on their own machines.

**Anti-surveillance stance:** the profile is *for you*. Pickaxis will never add manager dashboards or profile sync. If a team wants that, it's a fork — not pickaxis.

---

## 10. Configuration — `/px-config` and `pickaxis.yaml`

Pickaxis is fully configurable from inside Claude Code via `/px-config`.

```
/px-config              # interactive: show settings, change what you want
/px-config disable      # mute pickaxis for now (slash commands still work)
/px-config enable       # turn it back on
/px-config quiet        # frequency: rare — interjects ~15% of the time
/px-config balanced     # frequency: balanced — interjects ~50% of the time
/px-config intensive    # frequency: intensive — interjects whenever salient
```

When pickaxis is **disabled**, slash commands still work but every MCP tool short-circuits with a "currently disabled" message and no proactive nudges fire. Use this when you want quiet for a session.

The settings are persisted in `pickaxis.yaml` at the repo root (committed, shared with the team):

```yaml
enabled: true
features:
  nudges: true       # mid-work ad-hoc questions / "read this file"
  challenges: true   # proactive offers of challenge exercises
  ticketLoop: true   # reserved (Round 2: per-ticket reflect)
  sessionDigest: true # reserved (Round 3: session digests)
frequency: balanced  # rare | balanced | intensive

packs:
  - polyglot
detectedStacks:
  - django@src/www
  - vite@src/www/frontend
  - python@src
assess:
  reassessAfterDays: 30
privacy:
  sendPromptsToHostAi: true
  logFileTouches: true
tools: {}
```

| Key | Meaning |
| --- | --- |
| `enabled` | Global on/off. When false, MCP tools short-circuit and no nudges fire. |
| `features.nudges` | Mid-work ad-hoc questions / file-read suggestions (`nudge_suggest`). |
| `features.challenges` | Proactive offers of `/px-challenge`-style exercises. |
| `features.ticketLoop` | Per-ticket loop (Round 2 feature — currently a no-op). |
| `features.sessionDigest` | End-of-session digest (Round 3 feature — currently a no-op). |
| `frequency` | How often nudges fire: `rare` ≈ 15%, `balanced` ≈ 50%, `intensive` always. |
| `packs` | Informational list of packs (runtime auto-detects which packs apply). |
| `detectedStacks` | What stack detection found at install time — informational. |
| `assess.reassessAfterDays` | When a score is considered stale (not yet enforced). |
| `privacy.sendPromptsToHostAi` | If false, open-ended grading via the host AI is disabled. |
| `privacy.logFileTouches` | Set false to disable passive observation. |
| `tools` | Reserved for composing other MCP servers (translation, Jira, …). |

### Stacks and packs

Pickaxis recognizes any project's languages and frameworks automatically (at any depth) — Django, Symfony, React, Go, Rails, and many more. You **don't** need a hand-written pack for your stack: when an axis has no curated questions, pickaxis generates them from your actual code.

Curated **packs** are an optional polish layer:

- `polyglot` — always loaded; generic git/testing/SQL/security/AI-review questions.
- `shopware-php` — loads automatically on Shopware projects.

To add curated questions for a stack you care about, see **[pack-authoring.md](pack-authoring.md)**.

---

## 11. A suggested workflow

1. **First week on a project:** run `/px-assess` a handful of times to map your baseline, and `/px-assess-module <area>` on the parts you'll touch.
2. **Starting a ticket:** `/px-prime "<ticket>"` before prompting the AI; `/px-map` when you're hunting for where something lives.
3. **After the AI writes code:** read it critically — that's the `ai_literacy` muscle. Run `/px-assess ai_literacy` occasionally to keep yourself honest.
4. **Weekly:** `/px-review` to revisit what you got wrong, and `/px-challenge` for deliberate practice on your weakest axis.
5. **Watch `/px-profile`** over time — the goal is the scores climbing because *you* are, not the tool being generous.

---

## 12. Troubleshooting

**`/px-*` says "Unknown command".** Restart Claude Code — slash commands load at startup. Confirm `.claude/commands/px-*.md` exist.

**A command runs but the MCP tool isn't available.** Check `.mcp.json` exists at the repo root and lists `pickaxis`; approve the server when Claude Code prompts (or via `/mcp`). First launch may take ~30s while pickaxis builds from GitHub.

**Scores seem stuck.** Make sure you're answering, not skipping — and remember only harder questions push toward L4. Check `/px-profile`'s `score` (not just the level) to see sub-level movement.

**Wrong stack detected / wrong files in questions.** Make sure `pickaxis.yaml` is at your repo root. Detection scans the whole tree, so nested projects are fine, but the root anchors the fingerprint and config.

**Start over on one project.** Delete `~/.pickaxis/<repo-fingerprint>/` to reset that project's profile and history.

---

## See also

- **[getting-started.md](getting-started.md)** — installation and first run
- **[pack-authoring.md](pack-authoring.md)** — write curated questions for a stack
- **[README](../README.md)** — motivation and the privacy stance
