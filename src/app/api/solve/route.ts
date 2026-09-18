import { NextRequest } from "next/server";
import { choice, getEngineClient, noul, score } from "@/server/jev-engine";
import { parseHistory, scrambleStats, solveFor, type Move } from "@/lib/cube";
import { applyMoves, solvedCube, isSolved } from "@/lib/cubie";
import {
  buildCross, seatCorner, threadEdge, orientTopEdges, permuteTopEdges,
  finishTopCorners,
} from "@/lib/solve-lbl";
import { solveKociemba, referenceFacelets, referenceSolves } from "@/lib/solve-kociemba";
import { JEV_TOOLS, ROASTS, TIERS, type TierKey, type ToolKey } from "@/lib/memes";

export const runtime = "nodejs";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// SECURITY MODEL
// - Engine credentials and endpoint live only in server env
//   (JEV_ENGINE_API_KEY / JEV_ENGINE_BASE_URL — never NEXT_PUBLIC_*, never
//   hardcoded). The raw upstream request (cube state, questions, criteria) and
//   the raw response (probabilities, confidence, usage, model id) NEVER leave
//   this process: no logs, no client payload. The stream only carries curated
//   gameplay events signed with our own engine name — provider infrastructure
//   is an implementation detail of this route, accessed exclusively through
//   the server-only adapter in src/server/jev-engine.ts.
//
// SOLVE MODEL — Jev paves the way:
// The engine is a judgment model: given the FULL cube reality (facelets +
// progress) it answers structured questions, so the solve runs as an agent
// loop. Each turn Jev sees the live state and picks the next tool ("seat the
// front-left corner", "go superhuman"); the toolbox executes exactly that
// piece-scoped job, and the updated reality is fed back for the next pick.
// Every tool is verified locally and the final sequence must solve the
// reference model or the route refuses to stream it.
// ---------------------------------------------------------------------------

const client = getEngineClient();

// Public engine signature — ours, deliberately provider-agnostic.
const ENGINE = "jev-stream/1";

// Small in-memory rate limiter (per warm instance; good enough for a demo).
const hits = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 12;
const WINDOW_MS = 60_000;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > LIMIT;
}

type Judgement = {
  tier: TierKey;
  stars: number;
  roast: string;
  chaos: boolean;
  tokens: number;
  live: boolean;
};

type Waypoint = { tool: ToolKey; moves: Move[] };

// The judgment pass — call 1 of the agent loop. Everything in this function is
// server-private. Jev rates the scramble AND picks its first tool from full
// cube reality.
async function judgeAndPickFirst(
  history: Move[],
  state: ReturnType<typeof applyMoves>,
  facelets: string | null,
  toolOptions: ToolKey[],
): Promise<{ judgement: Judgement; firstTool: ToolKey | null }> {
  const stats = scrambleStats(history);
  const requestState = {
    cube: {
      facelets,
      progress: progressOf(state),
      note: "54-sticker URFDLB facelet string of the scrambled cube; progress lists solved jobs.",
    },
    scramble: {
      moves: history,
      totalTurns: stats.length,
      simplifiedTurns: stats.simplifiedLength,
      wastefulCancellations: stats.cancellations,
      faceDistribution: stats.faceCounts,
    },
  };

  const optionsOf = (keys: ToolKey[]) =>
    Object.fromEntries(keys.map((k) => [k, JEV_TOOLS[k].choice]));

  try {
    if (!client) throw new Error("no-key");
    const response = await client.systemOne({
      state: requestState,
      questions: {
        chaos_tier: choice(
          "Based on the scramble, what meme tier describes the player who made it?",
          {
            GIGACHAD_SCRAMBLE: "Monstrous, high-effort chaos. Long, devious, no mercy.",
            CERTIFIED_COOKER: "Solid, genuinely tricky scramble. The player cooked.",
            MID: "Average, forgettable difficulty. Nothing special.",
            NPC_CHAOS: "Random button mashing with little actual disorder.",
            TOUCH_GRASS: "Barely scrambles the cube. Trivial or lazy.",
          }
        ),
        // Rubric indices 0..4 map to stars 1..5.
        difficulty: score(
          "How brutally difficult is this scramble for a human speedcuber to undo without help?",
          [
            "Trivial: a few turns, undone on sight.",
            "Easy: short scramble with obvious cancellations.",
            "Moderate: a real scramble, solvable with focus.",
            "Hard: long, tangled, demands real skill.",
            "Brutal: maximum-entropy nightmare, GIGACHAD only.",
          ]
        ),
        genuine_chaos: noul(
          "Did the player create genuine disorder (many turns that do NOT undo each other)?",
          { true: "Most turns contribute new disorder.", false: "Many turns cancel each other out." }
        ),
        first_tool: choice(
          "You are Jev. This cube is scrambled. Using the toolbox, how do you start dismantling it?",
          optionsOf(toolOptions)
        ),
      },
    });

    const a = response.answers;
    // Raw inference (choice probabilities, confidence, rubric, usage, model id)
    // stays inside this function by design.
    const tier = (a.chaos_tier?.choice ?? "MID") as TierKey;
    const stars = Math.min(5, Math.max(1, Math.round((a.difficulty?.score ?? 2) + 1)));
    const chaos = (a.genuine_chaos?.noul ?? 0.5) > 0.6;
    const firstTool = toolOptions.includes(a.first_tool?.choice as ToolKey)
      ? (a.first_tool?.choice as ToolKey)
      : null;
    const roasts = ROASTS[tier];
    return {
      judgement: {
        tier,
        stars,
        roast: roasts[stats.length % roasts.length],
        chaos,
        tokens: response.usage.input_tokens + response.usage.output_tokens,
        live: true,
      },
      firstTool,
    };
  } catch {
    // Degraded mode: heuristic judge so the game keeps running. Still no
    // inference details are exposed (there are none).
    const tier: TierKey =
      stats.simplifiedLength >= 20 ? "GIGACHAD_SCRAMBLE"
      : stats.simplifiedLength >= 12 ? "CERTIFIED_COOKER"
      : stats.simplifiedLength >= 6 ? "MID"
      : stats.cancellations > 0 ? "NPC_CHAOS"
      : "TOUCH_GRASS";
    const stars = Math.min(5, Math.max(1, Math.ceil(stats.simplifiedLength / 5)));
    const roasts = ROASTS[tier];
    return {
      judgement: {
        tier,
        stars,
        roast: roasts[stats.length % roasts.length],
        chaos: stats.cancellations === 0,
        tokens: 0,
        live: false,
      },
      firstTool: null,
    };
  }
}

// Progress summary fed back to Jev between picks — the "map" part of full
// reality. All server-private.
function progressOf(state: ReturnType<typeof applyMoves>) {
  const edgeDone = (p: number) => state.ep[p] === p && state.eo[p] === 0;
  const cornerDone = (p: number) => state.cp[p] === p && state.co[p] === 0;
  return {
    crossEdges: ["DR", "DF", "DL", "DB"].filter((_, i) => edgeDone(4 + i)),
    bottomCorners: ["DFR", "DLF", "DBL", "DRB"].filter((_, i) => cornerDone(4 + i)),
    middleEdges: ["FR", "FL", "BL", "BR"].filter((_, i) => edgeDone(8 + i)),
    topEdgesOriented: [0, 1, 2, 3].filter((i) => state.eo[i] === 0).length,
    topSolved: [0, 1, 2, 3].every((i) => edgeDone(i) && cornerDone(i)),
  };
}

// Which tools make sense right now — only solvable, non-redundant jobs are
// offered to Jev.
function availableTools(state: ReturnType<typeof applyMoves>): ToolKey[] {
  const edgeDone = (p: number) => state.ep[p] === p && state.eo[p] === 0;
  const cornerDone = (p: number) => state.cp[p] === p && state.co[p] === 0;
  const crossDone = [4, 5, 6, 7].every(edgeDone);
  const tools: ToolKey[] = [];
  if (!crossDone) tools.push("cross:swift", "cross:grind");
  for (let r = 0; r < 4; r++) if (!cornerDone(4 + r)) tools.push(`corner:${r}` as ToolKey);
  if (crossDone && [4, 5, 6, 7].every((p) => cornerDone(p))) {
    for (let r = 0; r < 4; r++) if (!edgeDone(8 + r)) tools.push(`edge:${r}` as ToolKey);
  }
  if (crossDone && [4, 5, 6, 7].every(cornerDone) && [8, 9, 10, 11].every(edgeDone)) {
    if ([0, 1, 2, 3].some((i) => state.eo[i] !== 0)) tools.push("top:cross");
    const edgesMatched = [0, 1, 2, 3].every((i) => edgeDone(i));
    if ([0, 1, 2, 3].every((i) => state.eo[i] === 0) && !edgesMatched) tools.push("top:edges");
    if (edgesMatched && [0, 1, 2, 3].some((i) => state.cp[i] !== i || state.co[i] !== 0)) {
      tools.push("top:corners");
    }
  }
  tools.push("speedrun");
  return tools;
}

// Execute one Jev-chosen tool against the live state.
async function executeTool(tool: ToolKey, state: ReturnType<typeof applyMoves>, historySoFar: Move[]): Promise<Move[]> {
  switch (tool) {
    case "cross:swift": return buildCross(state, "SWIFT");
    case "cross:grind": return buildCross(state, "GRIND");
    case "corner:0": case "corner:1": case "corner:2": case "corner:3":
      return seatCorner(state, Number(tool.split(":")[1]));
    case "edge:0": case "edge:1": case "edge:2": case "edge:3":
      return threadEdge(state, Number(tool.split(":")[1]));
    case "top:cross": return orientTopEdges(state);
    case "top:edges": return permuteTopEdges(state);
    case "top:corners": return finishTopCorners(state);
    case "speedrun": return solveKociemba(historySoFar);
    case "rewind": throw new Error("rewind is a label, not a tool");
  }
}

// Later picks: Jev sees the updated reality and paves the next stretch.
async function pickNext(
  state: ReturnType<typeof applyMoves>,
  facelets: string | null,
  options: ToolKey[],
): Promise<ToolKey | null> {
  try {
    if (!client) throw new Error("no-key");
    const response = await client.systemOne({
      state: {
        cube: {
          facelets,
          progress: progressOf(state),
          note: "Live cube after your last tool. Pick the next job from the toolbox.",
        },
      },
      questions: {
        next_tool: choice(
          "You are Jev, mid-solve. Given this cube state, which tool do you deploy next?",
          Object.fromEntries(options.map((k) => [k, JEV_TOOLS[k].choice]))
        ),
      },
    });
    const picked = response.answers.next_tool?.choice as ToolKey;
    return options.includes(picked) ? picked : null;
  } catch {
    return null; // any engine hiccup → superhuman fallback takes over
  }
}

function xpFor(j: Judgement, solutionLength: number): number {
  return j.stars * 20 + solutionLength * 6 + (j.chaos ? 15 : 0) + (j.tier === "GIGACHAD_SCRAMBLE" ? 25 : 0);
}

const sse = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip)) {
    return new Response(JSON.stringify({ error: "bruh, chill. try again in a minute 🐢" }), {
      status: 429,
      headers: { "content-type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  let history: string[];
  try {
    history = parseHistory((body as { history?: unknown }).history);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  if (history.length === 0) {
    return Response.json({ error: "cube is already solved, genius 😎" }, { status: 400 });
  }

  // --- the agent loop: Jev paves the way, the toolbox executes ----------------
  let state = applyMoves(solvedCube(), history);
  const soFar: Move[] = [...history];
  const waypoints: Waypoint[] = [];
  const { judgement, firstTool } = await judgeAndPickFirst(
    history, state, referenceFacelets(history), availableTools(state)
  );
  const agentBudgetStart = Date.now();
  const AGENT_BUDGET_MS = 26_000;
  const MAX_PICKS = 10;

  let tool = firstTool;
  for (let picks = 0; !isSolved(state) && picks < MAX_PICKS + 2; picks++) {
    const options = availableTools(state);
    if (!tool || !options.includes(tool)) tool = "speedrun";
    if (tool !== "speedrun" && (Date.now() - agentBudgetStart > AGENT_BUDGET_MS || picks >= MAX_PICKS)) {
      tool = "speedrun";
    }
    let moves: Move[];
    try {
      moves = await executeTool(tool, state, soFar);
    } catch {
      tool = "speedrun"; // tool blew up — superhuman takes the wheel
      try {
        moves = await executeTool(tool, state, soFar);
      } catch {
        break; // even kociemba failed; the verification gate below rewinds
      }
    }
    if (moves.length > 0) {
      waypoints.push({ tool, moves });
      state = applyMoves(state, moves);
      soFar.push(...moves);
    }
    if (isSolved(state) || tool === "speedrun") break;
    tool = await pickNext(state, referenceFacelets(soFar), availableTools(state));
  }

  // --- verification gate: the stream must genuinely solve the cube -----------
  let solution: Move[] = waypoints.flatMap((w) => w.moves);
  if (waypoints.length === 0 || !isSolved(state) || !referenceSolves(history, solution)) {
    solution = solveFor(history);
    waypoints.length = 0;
    waypoints.push({ tool: "rewind", moves: solution }); // labeled honestly
  }

  const xp = xpFor(judgement, solution.length);
  // Pace the solve so it reads like the AI is thinking move-by-move, with a
  // time budget so even monster scrambles finish inside the function limit.
  // The client matches its animation to this exact pace.
  const perMove = Math.max(5, Math.min(90, Math.min(260, 36000 / solution.length)));

  const usedSpeedrun = waypoints.some((w) => w.tool === "speedrun");
  // Curated gameplay events only — no provider, model, or timing metadata.
  const meta = {
    engine: ENGINE,
    solutionLength: solution.length,
    tools: waypoints.length,
    superhuman: usedSpeedrun,
    tier: judgement.tier,
    tierLabel: TIERS[judgement.tier].label,
    tierEmoji: TIERS[judgement.tier].emoji,
    stars: judgement.stars,
    roast: judgement.roast,
    chaos: judgement.chaos,
    tokens: judgement.tokens,
    paceMs: Math.round(perMove),
    xp,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sse(event, data)));
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

      try {
        send("meta", meta);
        await sleep(600);

        for (const w of waypoints) {
          send("waypoint", {
            tool: w.tool,
            label: JEV_TOOLS[w.tool].label,
            emoji: JEV_TOOLS[w.tool].emoji,
            feed: JEV_TOOLS[w.tool].feed,
            moves: w.moves.length,
          });
          for (let i = 0; i < w.moves.length; i++) {
            send("move", { move: w.moves[i], i, n: solution.length });
            await sleep(perMove);
          }
        }

        send("done", { xp, solved: true });
      } catch {
        try {
          send("error", { message: "Jev tripped on a LAN cable. Try again 🙃" });
        } catch {
          // stream already closed
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
