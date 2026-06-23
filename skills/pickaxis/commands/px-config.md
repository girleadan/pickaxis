---
description: View or change pickaxis configuration (enable/disable, frequency, features).
argument-hint: "[enable | disable | quiet | balanced | intensive] (optional shortcut)"
---

The user wants to view or change pickaxis configuration.

## Shortcut arguments (if provided)

If the argument is one of these, just apply it and confirm — no further conversation needed:

| Arg | Call |
| --- | --- |
| `enable` | `config_set { enabled: true }` |
| `disable` | `config_set { enabled: false }` |
| `quiet` or `rare` | `config_set { frequency: "rare" }` |
| `balanced` | `config_set { frequency: "balanced" }` |
| `intensive` | `config_set { frequency: "intensive" }` |

After the call, show the returned `summary` line and stop.

## No argument — interactive flow

1. Call `config_get` and show the dev the current summary plus the per-feature flags (`nudges`, `challenges`, `ticketLoop`, `sessionDigest`) in a short list.
2. Ask what they want to change. Offer plain-language options:
   - "Turn pickaxis off for now" → `config_set { enabled: false }`
   - "Change how often I'll interrupt you" → ask rare/balanced/intensive → `config_set { frequency: ... }`
   - "Disable a feature" → ask which → `config_set { features: { ...: false } }`
   - "Enable a feature" → likewise with `true`
3. After applying the patch, show the new `summary` line and a one-line "what changed."
4. If `enabled` was just turned off, gently mention: `/px-*` commands still work, but no proactive nudges will fire. To turn back on, run `/px-config enable`.

Keep it conversational and brief — this should feel like a setting toggle, not a setup wizard.
