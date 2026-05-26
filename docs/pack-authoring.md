# Writing a pickaxis stack pack

A **pack** teaches pickaxis what "knowing this stack" means. The default install ships two packs: `polyglot` (always loaded) and `shopware-php` (the pilot). Anyone can write more.

## What a pack contains

A pack is a module that exports a `Pack` object (see [`src/packs/contract.ts`](../src/packs/contract.ts)). It declares:

- **`id`** — kebab-case, unique. Used in `pickaxis.yaml`.
- **`name`** — human-readable.
- **`detects(repo)`** — returns true if this pack should auto-load for the repo (e.g. shopware-php looks for `composer.json` with the `shopware/core` dependency).
- **`categories`** — extra skill axes this pack contributes beyond the built-in nine.
- **`questions`** — seed question bank, indexed by category and difficulty.
- **`codemapHeuristics`** — how to identify modules in this kind of project (e.g. Shopware uses `src/Resources/...`, `src/Core/Content/...`).
- **`antiPatterns`** — common anti-patterns to spot in the dev's accepted AI output, used by the challenge engine.

## Question shape

Each question is a small object: a prompt, the skill axis it tests, a difficulty (0–4), and a grading rubric. Grading is delegated to the host AI — the rubric tells it what to look for, so the pack author doesn't write a grader.

## Publishing

Packs are plain npm modules whose name matches `pickaxis-pack-*`. Pickaxis's init flow will offer to install detected packs from the registry. (Not implemented in the initial scaffold — for now packs live inside the pickaxis repo.)
