#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { SKILL_AXES } from "../profile/model.js";
import {
  appendAssessmentRecord,
  appendEvidence,
  applyAnswer,
  assessmentLogFile,
  bumpAxis,
  bumpModule,
  loadOrInitProfile,
  readAssessmentRecords,
  summarizeProfile,
} from "../profile/store.js";
import type { Outcome } from "../profile/model.js";
import { displayLevel } from "../profile/model.js";
import { BUILTIN_PACKS, detectPacks, getPack } from "../packs/index.js";
import { readRepoSignals } from "./signals.js";
import { walkRepo } from "../codemap/indexer.js";
import { probeFilesForAxis } from "../assessment/axisProbes.js";

/**
 * Resolve the project root. Priority:
 *   1. PICKAXIS_REPO_ROOT env var (explicit override).
 *   2. Walk up from cwd to the nearest directory containing pickaxis.yaml.
 *      Claude Code launches project MCP servers with cwd at the project root,
 *      so this normally matches on the first iteration. This keeps .mcp.json
 *      portable — no machine-specific absolute path baked in.
 *   3. Fall back to cwd.
 */
function resolveRepoRoot(): string {
  if (process.env.PICKAXIS_REPO_ROOT) return resolve(process.env.PICKAXIS_REPO_ROOT);
  let dir = resolve(process.cwd());
  for (let i = 0; i < 25; i++) {
    if (existsSync(join(dir, "pickaxis.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(process.cwd());
}

const repoRoot = resolveRepoRoot();

const tools = [
  {
    name: "assess_start",
    description:
      "Begin (or resume) a socratic assessment. Returns the next unasked question targeting the dev's least-confident axis. The host AI is expected to relay the question to the user and then call assess_answer with the grading result.",
    inputSchema: {
      type: "object",
      properties: {
        axis: {
          type: "string",
          enum: SKILL_AXES as unknown as string[],
          description: "Optional: restrict to a specific skill axis.",
        },
      },
    },
  },
  {
    name: "assess_answer",
    description:
      "Record the result of an assessment question. The host AI grades the user's response and reports the outcome here; pickaxis updates the profile and saves a reviewable record. For static-pack questions pass `questionId` (prompt/axis are looked up). For dynamic module questions pass `axis` + `prompt` + `module` instead.",
    inputSchema: {
      type: "object",
      required: ["outcome"],
      properties: {
        questionId: {
          type: "string",
          description: "ID of a static-pack question. Omit for dynamic module questions.",
        },
        axis: {
          type: "string",
          enum: SKILL_AXES as unknown as string[],
          description: "Required when there is no questionId (dynamic question).",
        },
        prompt: {
          type: "string",
          description: "The question text. Required when there is no questionId.",
        },
        module: {
          type: "string",
          description: "Module path/name this question was about (module-scoped assessments).",
        },
        difficulty: {
          type: "integer",
          minimum: 0,
          maximum: 4,
          description: "Difficulty of a dynamic question (0–4). Ignored for static questions (their own difficulty is used). Defaults to 2 if omitted.",
        },
        answerSummary: {
          type: "string",
          description: "A short summary of what the developer actually answered.",
        },
        outcome: {
          type: "string",
          enum: ["correct", "partial", "incorrect", "skipped"],
        },
        notes: { type: "string", description: "Grader reasoning — why this outcome, what was missed." },
      },
    },
  },
  {
    name: "assessment_history",
    description:
      "Return past assessment records (question, the dev's answer, outcome, grader reasoning) so the developer can review what they got wrong. Defaults to incorrect + partial outcomes, newest first.",
    inputSchema: {
      type: "object",
      properties: {
        axis: { type: "string", enum: SKILL_AXES as unknown as string[] },
        module: { type: "string" },
        outcome: {
          type: "string",
          enum: ["incorrect", "partial", "all"],
          description: "Filter. Default: incorrect + partial.",
        },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
      },
    },
  },
  {
    name: "assess_module_start",
    description:
      "Begin a module-scoped assessment of a specific code area. Returns the module's file manifest plus instructions for the host AI to read the code and quiz the developer on what it does, how it's built, and why. The host AI records each answer via assess_answer with `module` set.",
    inputSchema: {
      type: "object",
      required: ["module"],
      properties: {
        module: {
          type: "string",
          description: "A path or name fragment identifying the module (e.g. 'connectors_manager' or 'src/auth').",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 80,
          default: 40,
          description: "Max files to include in the manifest.",
        },
      },
    },
  },
  {
    name: "profile_get",
    description:
      "Return the current developer skill profile and a human-readable summary.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "profile_update",
    description:
      "Bump a skill axis based on passive evidence (e.g. an Edit hook recorded a file touch). Use small deltas.",
    inputSchema: {
      type: "object",
      required: ["axis", "delta"],
      properties: {
        axis: { type: "string", enum: SKILL_AXES as unknown as string[] },
        delta: { type: "number", description: "Typically +/- 0.1 to 0.5." },
        modulePath: { type: "string" },
        kind: {
          type: "string",
          enum: ["edit", "ai_prompt", "ai_accept", "commit", "challenge_completed"],
        },
        detail: { type: "string" },
      },
    },
  },
  {
    name: "codemap_query",
    description:
      "Walk the repo and return files/modules matching the loaded packs' heuristics, filtered by a free-text query. Verbosity scales to the dev's familiarity with each match.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
    },
  },
  {
    name: "ticket_prime",
    description:
      "Given a ticket title/description, return a primer: relevant modules to read, anti-patterns to watch for, and questions the dev should be able to answer before prompting the AI.",
    inputSchema: {
      type: "object",
      required: ["ticket"],
      properties: {
        ticket: {
          type: "string",
          description: "Ticket title or short description.",
        },
      },
    },
  },
  {
    name: "challenge_suggest",
    description:
      "Suggest a stretch exercise targeting the dev's weakest axis. Returns a question and an exercise framing.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "tool_invoke",
    description:
      "Composition hook: invoke another tool registered in pickaxis.yaml (e.g. a translation MCP server). Stub in the initial scaffold.",
    inputSchema: {
      type: "object",
      required: ["target"],
      properties: {
        target: { type: "string" },
        args: { type: "object" },
      },
    },
  },
];

const server = new Server(
  { name: "pickaxis", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    const result = await dispatch(name, args as Record<string, unknown>);
    return { content: [{ type: "text", text: result }] };
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `pickaxis error in ${name}: ${(err as Error).message}`,
        },
      ],
    };
  }
});

async function dispatch(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "profile_get": {
      const signals = await readRepoSignals(repoRoot);
      const packs = detectPacks(signals).map((p) => p.id);
      const profile = await loadOrInitProfile(repoRoot, packs);
      return summarizeProfile(profile);
    }

    case "profile_update": {
      const axis = args.axis as (typeof SKILL_AXES)[number];
      const delta = Number(args.delta);
      const detail = (args.detail as string | undefined) ?? "";
      const profile = await bumpAxis(repoRoot, axis, delta, detail);
      await appendEvidence(repoRoot, {
        at: new Date().toISOString(),
        kind: (args.kind as
          | "edit"
          | "ai_prompt"
          | "ai_accept"
          | "commit"
          | "challenge_completed") ?? "edit",
        axis,
        modulePath: args.modulePath as string | undefined,
        detail,
        scoreDelta: delta,
      });
      return `Updated axis ${axis} → level ${profile.axes[axis]?.level}.`;
    }

    case "assess_start": {
      const signals = await readRepoSignals(repoRoot);
      const packs = detectPacks(signals);
      const profile = await loadOrInitProfile(
        repoRoot,
        packs.map((p) => p.id),
      );
      const focusAxis =
        (args.axis as (typeof SKILL_AXES)[number] | undefined) ??
        weakestAxis(profile.axes);
      const curated = packs.flatMap((p) => p.questions).filter((q) => q.axis === focusAxis);
      const probe = probeFilesForAxis(focusAxis, await walkRepo(repoRoot), signals);
      const projectSpecific = probe.files.length > 0 ? probe : null;

      if (curated.length === 0 && !projectSpecific) {
        return `No curated questions and no relevant code found for axis "${focusAxis}" in this project. Try a different axis.`;
      }

      return JSON.stringify(
        {
          axis: focusAxis,
          curated,
          projectSpecific,
          instruction:
            `Run a short assessment session for the "${focusAxis}" axis. ` +
            (curated.length > 0
              ? `First ask each curated question below (show only its prompt — keep the rubric private), grade honestly against the rubric, and record via assess_answer with that questionId (include answerSummary + notes). `
              : `There are no curated questions for this axis. `) +
            (projectSpecific
              ? `Then read a representative sample of projectSpecific.files and ask 1–2 questions about how THIS project handles "${focusAxis}" (guided by projectSpecific.focus); grade and record each via assess_answer with axis "${focusAxis}", your prompt (no questionId), a difficulty 0–4 estimate, answerSummary, outcome, and notes. `
              : ``) +
            `Ask one question at a time; never reveal the answer first; partial credit is normal. At the end, mention /px-review.`,
        },
        null,
        2,
      );
    }

    case "assess_answer": {
      const questionId = args.questionId as string | undefined;
      const outcome = args.outcome as Outcome;
      const module = args.module as string | undefined;
      const notes = args.notes as string | undefined;
      const answerSummary = args.answerSummary as string | undefined;

      // Resolve axis + prompt + difficulty: static-pack question (by id) or dynamic (passed in).
      let axis: (typeof SKILL_AXES)[number];
      let prompt: string;
      let difficulty: number;
      if (questionId) {
        const question = findQuestion(questionId);
        if (!question) return `Unknown question id: ${questionId}`;
        axis = question.axis;
        prompt = question.prompt;
        difficulty = question.difficulty;
      } else {
        const passedAxis = args.axis as (typeof SKILL_AXES)[number] | undefined;
        const passedPrompt = args.prompt as string | undefined;
        if (!passedAxis || !passedPrompt) {
          return "For a dynamic question (no questionId), both `axis` and `prompt` are required.";
        }
        axis = passedAxis;
        prompt = passedPrompt;
        difficulty = args.difficulty !== undefined ? Number(args.difficulty) : 2;
      }

      const { profile, scoreDelta } = await applyAnswer(repoRoot, axis, outcome, difficulty, notes);
      if (module) await bumpModule(repoRoot, module, scoreDelta);

      await appendAssessmentRecord(repoRoot, {
        at: new Date().toISOString(),
        axis,
        module,
        questionId,
        prompt,
        answerSummary,
        outcome,
        graderNotes: notes,
        scoreDelta,
      });
      await appendEvidence(repoRoot, {
        at: new Date().toISOString(),
        kind: "assessment_answer",
        axis,
        modulePath: module,
        detail: `${questionId ?? "dynamic"}:${outcome}`,
        scoreDelta,
      });

      const axisScore = profile.axes[axis]?.level ?? 0;
      const moduleNote = module
        ? ` · ${module} score ${(profile.modules.find((m) => m.path === module)?.level ?? 0).toFixed(1)}`
        : "";
      return `Recorded ${outcome} (difficulty ${difficulty}). ${axis} → L${displayLevel(axisScore)} (score ${axisScore.toFixed(1)})${moduleNote}.`;
    }

    case "assessment_history": {
      const outcomeArg = (args.outcome as string | undefined) ?? "default";
      const outcomes =
        outcomeArg === "all"
          ? undefined
          : outcomeArg === "incorrect"
            ? (["incorrect"] as Outcome[])
            : outcomeArg === "partial"
              ? (["partial"] as Outcome[])
              : (["incorrect", "partial"] as Outcome[]);
      const records = await readAssessmentRecords(repoRoot, {
        axis: args.axis as (typeof SKILL_AXES)[number] | undefined,
        module: args.module as string | undefined,
        outcomes,
        limit: Number(args.limit ?? 50),
      });
      if (records.length === 0) {
        return "No matching assessment records yet. Run /px-assess or /px-assess-module first.";
      }
      return JSON.stringify(
        {
          count: records.length,
          logFile: assessmentLogFile(repoRoot),
          records,
          instruction:
            "Group these by axis (and module if present). For each, show the question and the grader feedback, and briefly state what a strong answer covers. Point the developer at logFile for the full transcript.",
        },
        null,
        2,
      );
    }

    case "assess_module_start": {
      const moduleArg = String(args.module ?? "").trim();
      if (!moduleArg) return "Provide a `module` (path or name fragment).";
      const limit = Number(args.limit ?? 40);
      const signals = await readRepoSignals(repoRoot);
      const packs = detectPacks(signals);
      const allFiles = await walkRepo(repoRoot);
      const needle = moduleArg.toLowerCase();
      const files: { path: string; labels: string[] }[] = [];
      for (const f of allFiles) {
        if (!f.toLowerCase().includes(needle)) continue;
        const labels: string[] = [];
        for (const pack of packs) {
          for (const h of pack.codemapHeuristics) {
            if (h.matches(f)) labels.push(`${pack.id}:${h.label}`);
          }
        }
        files.push({ path: f, labels });
        if (files.length >= limit) break;
      }
      if (files.length === 0) {
        return `No files matched "${moduleArg}". Try a different path or name fragment (e.g. a directory name).`;
      }
      return JSON.stringify(
        {
          module: moduleArg,
          fileCount: files.length,
          files,
          instruction:
            "Read a representative sample of these files, then ask the developer 2–4 questions about THIS module: (1) what it does and who uses it (axis: business), (2) how it's structured and why (axis: codebase), (3) any framework-specific patterns it relies on (axis: framework). Ask one at a time. Grade each honestly against what the code actually shows, then call assess_answer with module set to this module's name, the matching axis, the prompt you asked, a short answerSummary, the outcome, and grader notes. Do not reveal answers before the developer attempts each question.",
        },
        null,
        2,
      );
    }

    case "codemap_query": {
      const query = String(args.query ?? "").toLowerCase();
      const limit = Number(args.limit ?? 20);
      const signals = await readRepoSignals(repoRoot);
      const packs = detectPacks(signals);
      const files = await walkRepo(repoRoot);
      const matches: { path: string; labels: string[]; describe: string }[] = [];
      for (const f of files) {
        const labels: string[] = [];
        let describe = "";
        for (const pack of packs) {
          for (const h of pack.codemapHeuristics) {
            if (h.matches(f)) {
              labels.push(`${pack.id}:${h.label}`);
              describe = h.describe;
            }
          }
        }
        const hay = (f + " " + labels.join(" ")).toLowerCase();
        if (labels.length > 0 && (!query || hay.includes(query))) {
          matches.push({ path: f, labels, describe });
        }
        if (matches.length >= limit) break;
      }
      if (matches.length === 0) {
        return `No matches for "${query}". Loaded packs: ${packs.map((p) => p.id).join(", ")}.`;
      }
      return matches
        .map((m) => `${m.path}\n    [${m.labels.join(", ")}] ${m.describe}`)
        .join("\n");
    }

    case "ticket_prime": {
      const ticket = String(args.ticket ?? "");
      const signals = await readRepoSignals(repoRoot);
      const packs = detectPacks(signals);
      const profile = await loadOrInitProfile(
        repoRoot,
        packs.map((p) => p.id),
      );
      const weak = weakestAxis(profile.axes);
      const antiPatterns = packs.flatMap((p) => p.antiPatterns).slice(0, 3);
      return JSON.stringify(
        {
          ticket,
          suggestedFocusAxis: weak,
          instruction:
            "Use codemap_query with keywords from the ticket to identify the modules to read. Surface the anti-patterns below as things to watch for. Pose at least one pre-AI question for the developer to answer before they prompt the AI.",
          antiPatterns,
          packsLoaded: packs.map((p) => p.id),
        },
        null,
        2,
      );
    }

    case "challenge_suggest": {
      const signals = await readRepoSignals(repoRoot);
      const packs = detectPacks(signals);
      const profile = await loadOrInitProfile(
        repoRoot,
        packs.map((p) => p.id),
      );
      const weak = weakestAxis(profile.axes);
      const question = packs.flatMap((p) => p.questions).find((q) => q.axis === weak);
      return JSON.stringify(
        {
          targetAxis: weak,
          question: question ?? null,
          framing:
            "Pose this as a stretch exercise, not a quiz. After the dev attempts it, grade it as if it were an assess_answer call.",
        },
        null,
        2,
      );
    }

    case "tool_invoke": {
      return `tool_invoke is a stub in 0.1.0. Target was: ${String(args.target)}. Add the target to pickaxis.yaml under 'tools:' and wire it in a future release.`;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function weakestAxis(
  axes: Record<string, { level: number; confidence: number }>,
): (typeof SKILL_AXES)[number] {
  let weak: (typeof SKILL_AXES)[number] = SKILL_AXES[0];
  let weakScore = Infinity;
  for (const axis of SKILL_AXES) {
    const s = axes[axis];
    const score = s ? s.level + s.confidence : 0;
    if (score < weakScore) {
      weakScore = score;
      weak = axis;
    }
  }
  return weak;
}

function findQuestion(id: string) {
  for (const pack of BUILTIN_PACKS) {
    const q = pack.questions.find((x) => x.id === id);
    if (q) return q;
  }
  return undefined;
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("pickaxis MCP server failed to start:", err);
  process.exit(1);
});
