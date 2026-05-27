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
  appendEvidence,
  bumpAxis,
  loadOrInitProfile,
  summarizeProfile,
} from "../profile/store.js";
import { BUILTIN_PACKS, detectPacks, getPack } from "../packs/index.js";
import { readRepoSignals } from "./signals.js";
import { walkRepo } from "../codemap/indexer.js";

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
      "Record the result of an assessment question. The host AI grades the user's response against the question's rubric and reports the outcome here. Pickaxis updates the profile accordingly.",
    inputSchema: {
      type: "object",
      required: ["questionId", "outcome"],
      properties: {
        questionId: { type: "string" },
        outcome: {
          type: "string",
          enum: ["correct", "partial", "incorrect", "skipped"],
        },
        notes: { type: "string", description: "Optional grader notes." },
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
      const pool = packs.flatMap((p) => p.questions).filter((q) => q.axis === focusAxis);
      const question = pool[0];
      if (!question) {
        return `No questions available for axis ${focusAxis}. Try a different axis or install more packs.`;
      }
      return JSON.stringify(
        {
          axis: focusAxis,
          question,
          instruction:
            "Ask the developer this question. When they answer, grade against the rubric, then call assess_answer with the questionId and outcome.",
        },
        null,
        2,
      );
    }

    case "assess_answer": {
      const questionId = args.questionId as string;
      const outcome = args.outcome as "correct" | "partial" | "incorrect" | "skipped";
      const question = findQuestion(questionId);
      if (!question) return `Unknown question id: ${questionId}`;
      const delta =
        outcome === "correct"
          ? 0.6
          : outcome === "partial"
            ? 0.3
            : outcome === "incorrect"
              ? -0.1
              : 0;
      const profile = await bumpAxis(repoRoot, question.axis, delta, args.notes as string);
      await appendEvidence(repoRoot, {
        at: new Date().toISOString(),
        kind: "assessment_answer",
        axis: question.axis,
        detail: `${questionId}:${outcome}`,
        scoreDelta: delta,
      });
      return `Recorded ${outcome} on ${questionId}. ${question.axis} is now L${profile.axes[question.axis]?.level}.`;
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
