---
description: View or change pickaxis configuration (enable/disable, frequency, features).
argument-hint: "[enable | disable | quiet | balanced | intensive] (optional shortcut)"
---

The user wants to view or change pickaxis configuration. Drive the interaction through Claude Code's **`AskUserQuestion` tool** so the dev gets a clickable picker rather than typing free-text replies.

## Shortcut arguments (skip the picker entirely)

If the slash command argument matches one of these, apply it directly and stop — no `AskUserQuestion` calls, no menus:

| Arg | Call |
| --- | --- |
| `enable` | `config_set { enabled: true }` |
| `disable` | `config_set { enabled: false }` |
| `quiet` or `rare` | `config_set { frequency: "rare" }` |
| `balanced` | `config_set { frequency: "balanced" }` |
| `intensive` | `config_set { frequency: "intensive" }` |

After the call, show the returned `summary` line and stop.

## No argument — interactive picker flow

### Step 1 — show the current state

Call `config_get` and print a tight summary:

```
pickaxis · ENABLED · frequency=balanced
  ✅ nudges        proactive coaching prompts
  ✅ challenges    stretch challenges for weak skill axes
  ✅ ticketLoop    ticket priming before you start prompting
  ✅ sessionDigest end-of-session summaries
```

(Adjust check/cross icons to match each feature's actual state.)

### Step 2 — call `AskUserQuestion` with the action picker

Use **one** `AskUserQuestion` call with this exact shape (substitute the labels based on current state — e.g. show "Turn pickaxis off" only when currently enabled; "Turn pickaxis on" otherwise):

```json
{
  "questions": [{
    "question": "What would you like to change?",
    "header": "px-config",
    "multiSelect": false,
    "options": [
      {
        "label": "Turn pickaxis OFF",
        "description": "Mute pickaxis — slash commands still work, but no proactive nudges or hooks fire until you re-enable."
      },
      {
        "label": "Change frequency",
        "description": "How often nudges fire: rare (~15%), balanced (~50%), or intensive (always when salient)."
      },
      {
        "label": "Toggle features",
        "description": "Turn individual capabilities on/off: nudges, challenges, ticket loop, session digest."
      },
      {
        "label": "Nothing — keep it as is",
        "description": "Close the picker without changes."
      }
    ]
  }]
}
```

If pickaxis is currently disabled, replace the first option with `{ label: "Turn pickaxis ON", description: "Re-enable proactive behavior." }` and put it first.

### Step 3 — branch on the answer

- **Turn ON / OFF** → call `config_set { enabled: <bool> }`, then go to Step 4.
- **Change frequency** → call `AskUserQuestion` again:
  ```json
  {
    "questions": [{
      "question": "How often should pickaxis interject?",
      "header": "Frequency",
      "multiSelect": false,
      "options": [
        { "label": "Rare (~15%)",      "description": "Pickaxis fires nudges occasionally. Quietest setting that's still active." },
        { "label": "Balanced (~50%)",  "description": "Default. Fires roughly half the time the host AI considers a nudge." },
        { "label": "Intensive (100%)", "description": "Fires whenever there's something salient to nudge about. Use when actively learning a stack." }
      ]
    }]
  }
  ```
  Map the choice to `config_set { frequency: "rare" | "balanced" | "intensive" }`.

- **Toggle features** → call `AskUserQuestion` with `multiSelect: true` listing all four features, pre-described:
  ```json
  {
    "questions": [{
      "question": "Which features should be ON? (Tap to toggle; submit to apply.)",
      "header": "Features",
      "multiSelect": true,
      "options": [
        { "label": "nudges",        "description": "Mid-work ad-hoc questions / 'go read this file' moments." },
        { "label": "challenges",    "description": "Proactive offers of /px-challenge-style exercises." },
        { "label": "ticketLoop",    "description": "Per-ticket priming and end-of-ticket reflection (Round 2)." },
        { "label": "sessionDigest", "description": "Short summary at the end of a session (Round 3)." }
      ]
    }]
  }
  ```
  The selected labels are the ones the dev wants ON. Build the patch by setting every feature true if it's in the selection, false otherwise. Then call `config_set { features: { ... } }`.

- **Nothing** → say "no changes" and stop.

### Step 4 — confirm

After any `config_set` call, show the returned `summary` line and a one-line "what changed". If `enabled` was just turned off, add: *"`/px-*` commands still work, but proactive nudges won't fire. Run `/px-config enable` to turn back on."*

---

**Don't** ask plain free-text questions or print a numbered text menu — always use `AskUserQuestion` so the dev gets a real clickable picker.
