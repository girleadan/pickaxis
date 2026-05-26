import { Pack } from "../contract.js";

export const polyglot: Pack = {
  id: "polyglot",
  name: "Polyglot (language-agnostic baseline)",
  detects: () => true,
  questions: [
    {
      id: "polyglot.git.rebase-vs-merge",
      axis: "devops",
      difficulty: 2,
      prompt:
        "In one sentence, when would you prefer `git rebase` over `git merge` on a feature branch, and what risk does that choice introduce?",
      rubric:
        "Looks for understanding that rebase rewrites history (cleaner log) but risks losing context and breaks shared branches. Partial credit if they name one without the trade-off.",
    },
    {
      id: "polyglot.testing.unit-vs-integration",
      axis: "testing",
      difficulty: 1,
      prompt:
        "What's the difference between a unit test and an integration test, and which one tends to catch more bugs in practice?",
      rubric:
        "Unit = isolated, fast, narrow. Integration = real wiring, slower, broader. Integration tests typically catch more real bugs. Look for honest acknowledgement of the latter.",
    },
    {
      id: "polyglot.sql.n-plus-one",
      axis: "database",
      difficulty: 2,
      prompt:
        "Describe an N+1 query problem in your own words and one way to spot it.",
      rubric:
        "Issuing one query per row of a parent result set. Spot via query logs, profiler, or unexpected slow endpoint on lists.",
    },
    {
      id: "polyglot.security.input-trust",
      axis: "security",
      difficulty: 2,
      prompt:
        "Where exactly in a request lifecycle should you validate untrusted input, and why not just rely on the database to reject bad data?",
      rubric:
        "At the boundary, as early as possible. DB rejection happens too late, gives worse errors, and may have happened after side-effects.",
    },
    {
      id: "polyglot.ai.review-discipline",
      axis: "ai_literacy",
      difficulty: 2,
      prompt:
        "When an AI tool generates a 50-line function for you, what's the first thing you check before accepting it?",
      rubric:
        "Strong answers: whether it does what the spec actually asked (not just compiles), whether it duplicates an existing utility, whether it handles the unhappy paths you care about. Weak answers stop at 'does it run'.",
    },
  ],
  codemapHeuristics: [
    {
      label: "tests",
      matches: (p) => /(^|\/)(tests?|__tests__|spec)(\/|$)/.test(p),
      describe: "Test files — start here to understand expected behavior.",
    },
    {
      label: "config",
      matches: (p) => /\.(env|config|yaml|yml|toml|ini)$/i.test(p),
      describe: "Configuration — read these before touching runtime behavior.",
    },
    {
      label: "migrations",
      matches: (p) => /(^|\/)migrations?(\/|$)/.test(p),
      describe: "Database migrations — the source of truth for the schema's history.",
    },
  ],
  antiPatterns: [
    {
      id: "polyglot.broad-catch",
      description: "Catching all exceptions and silently logging them.",
      detectHint: "Look for `catch (e)` blocks that only console.log or swallow the error.",
    },
    {
      id: "polyglot.duplicated-utility",
      description: "Reimplementing a function that already exists in the codebase.",
      detectHint: "AI tools love to invent fresh helpers; grep for similar names before accepting.",
    },
  ],
};
