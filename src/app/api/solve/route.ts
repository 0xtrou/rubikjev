import { NextRequest } from "next/server";
import { choice, getEngineClient, noul, score } from "@/server/jev-engine";
import { parseHistory, scrambleStats, solveFor, FACES, type Move } from "@/lib/cube";
import { applyMoves, solvedCube, isSolved } from "@/lib/cubie";
import {
  buildCross, seatCorner, threadEdge, orientTopEdges, permuteTopEdges,
  finishTopCorners,
} from "@/lib/solve-lbl";
import { solveKociembaFacelets, referenceFacelets, referenceSolvesFacelets } from "@/lib/solve-kociemba";
import { ROASTS, TIERS, type TierKey } from "@/lib/memes";

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
// SOLVE MODEL — Jev judges EVERY move, blind to history:
// The engine is a judgment model: given the cube's CURRENT reality (facelets
// + progress — never the scramble history, never the move log) it answers
// structured questions, so the solve runs as a move-by-move agent loop:
//   • the 18-move alphabet (U U' U2 D D' D2 … B B' B2) is declared once
//   • every turn Jev sees the fresh cube state and judges WHICH ONE MOVE to
//     play next; the server executes exactly that move and feeds the new
//     state back
//   • like a real cuber, Jev judges only what it sees — it has no idea what
//     moves created the scramble
//   • a wall-clock budget and stall detector hand the tail to the superhuman
//     (Kociemba) finisher; the final sequence must solve the reference model
//     or the route refuses to stream it
// ---------------------------------------------------------------------------

const client = getEngineClient();

// Public engine signature — ours, deliberately provider-agnostic.
const ENGINE = "jev-stream/1";

// The move alphabet — Jev's complete action space, declared once.
const ALPHABET: Move[] = FACES.flatMap((f) => [f, (f + "'") as Move, (f + "2") as Move]);

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

// A narrated moment in the stream (piece seated, phase done, speedrun handoff).
type Milestone = { at: number; emoji: string; feed: string };

const inverseOf = (m: Move): Move => (m.endsWith("'") ? m[0] : m + "'");

// Server-private judgment pass: verdict + first move in ONE call. The request
// state carries the cube reality only — the scramble history stays here.
async function judgeFirst(
  history: Move[],
  state: ReturnType<typeof applyMoves>,
  facelets: string | null,
): Promise<{ judgement: Judgement; firstMove: Move | null }> {
  const stats = scrambleStats(history);
  const requestState = {
    cube: {
      facelets,
      progress: progressOf(state),
      note:
        "54-sticker URFDLB facelet string of the scrambled cube. " +
        `Your move alphabet: ${ALPHABET.join(" ")}. ` +
        "Judge only what you see — no move history exists for you.",
    },
  };

  const optionsOf = (moves: Move[]) => Object.fromEntries(moves.map((m) => [m, `Play ${m}.`]));

  try {
    if (!client) throw new Error("no-key");
    const response = await client.systemOne({
      state: requestState,
      questions: {
        chaos_tier: choice(
          "Looking only at this scrambled cube state, what meme tier describes the player who left it like this?",
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
          "How brutally difficult is this scrambled state for a human speedcuber to solve without help?",
          [
            "Trivial: a few turns, undone on sight.",
            "Easy: short scramble with obvious cancellations.",
            "Moderate: a real scramble, solvable with focus.",
            "Hard: long, tangled, demands real skill.",
            "Brutal: maximum-entropy nightmare, GIGACHAD only.",
          ]
        ),
        genuine_chaos: noul(
          "Does this state show genuine deep disorder (most pieces far from home), or barely any disturbance?",
          { true: "The cube is deeply wrecked.", false: "The cube is barely disturbed." }
        ),
        first_move: choice(
          "You are Jev. This cube is scrambled and you will dismantle it one move at a time. Which single move do you play first?",
          optionsOf(ALPHABET)
        ),
      },
    });

    const a = response.answers;
    // Raw inference (choice probabilities, confidence, rubric, usage, model id)
    // stays inside this function by design.
    const tier = (a.chaos_tier?.choice ?? "MID") as TierKey;
    const stars = Math.min(5, Math.max(1, Math.round((a.difficulty?.score ?? 2) + 1)));
    const chaos = (a.genuine_chaos?.noul ?? 0.5) > 0.6;
    const firstMove = ALPHABET.includes(a.first_move?.choice as Move)
      ? (a.first_move?.choice as Move)
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
      firstMove,
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
      firstMove: null,
    };
  }
}

// Later turns: Jev sees the fresh state and judges the next single move.
async function judgeNextMove(
  state: ReturnType<typeof applyMoves>,
  facelets: string | null,
  turn: number,
  forbid: Move | null,
): Promise<Move | null> {
  try {
    if (!client) throw new Error("no-key");
    const options = ALPHABET.filter((m) => m !== forbid);
    const response = await client.systemOne({
      state: {
        cube: {
          facelets,
          progress: progressOf(state),
          note: `Live cube after turn ${turn}. Play exactly one move from your alphabet.`,
        },
      },
      questions: {
        next_move: choice(
          "You are Jev, dismantling the cube one move per turn. Which single move do you play now?",
          Object.fromEntries(options.map((m) => [m, `Play ${m}.`]))
        ),
      },
    });
    const picked = response.answers.next_move?.choice as Move;
    return options.includes(picked) ? picked : null;
  } catch {
    return null; // any engine hiccup → the fallback takes over
  }
}

// Progress summary fed back to Jev every turn — the "map". All server-private.
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

// Milestone narration: fires when the set of solved pieces grows.
const PIECE_LABEL: Record<string, string> = {
  DR: "DR cross edge", DF: "DF cross edge", DL: "DL cross edge", DB: "DB cross edge",
  DFR: "FRONT-RIGHT corner", DLF: "FRONT-LEFT corner", DBL: "BACK-LEFT corner", DRB: "BACK-RIGHT corner",
  FR: "FRONT-RIGHT edge", FL: "FRONT-LEFT edge", BL: "BACK-LEFT edge", BR: "BACK-RIGHT edge",
};
function milestoneFor(before: ReturnType<typeof progressOf>, after: ReturnType<typeof progressOf>): Milestone | null {
  const fresh = (list: string[], prev: string[]) =>
    list.filter((p) => !prev.includes(p));
  const newly =
    fresh(after.crossEdges, before.crossEdges).map((p) => `${PIECE_LABEL[p]} locked 🧱`)
    .concat(fresh(after.bottomCorners, before.bottomCorners).map((p) => `${PIECE_LABEL[p]} seated 🧩`))
    .concat(fresh(after.middleEdges, before.middleEdges).map((p) => `${PIECE_LABEL[p]} threaded 🔗`));
  if (after.topEdgesOriented === 4 && before.topEdgesOriented < 4) newly.push("top cross made ✚");
  if (after.topSolved && !before.topSolved) newly.push("cube FINISHED 🎯");
  if (newly.length === 0) return null;
  return { at: -1, emoji: "🧠", feed: newly.slice(0, 2).join(" · ") };
}

// Degraded (no engine key) path: the toolbox autopilot — the same move stream,
// just without Jev judging it.
async function degradedSolve(
  start: ReturnType<typeof applyMoves>,
): Promise<Move[]> {
  const solution: Move[] = [];
  let cur = start;
  const run = (ms: Move[]) => {
    if (ms.length) {
      solution.push(...ms);
      cur = applyMoves(cur, ms);
    }
  };
  const edgeDone = (s: ReturnType<typeof applyMoves>, p: number) => s.ep[p] === p && s.eo[p] === 0;
  const cornerDone = (s: ReturnType<typeof applyMoves>, p: number) => s.cp[p] === p && s.co[p] === 0;
  if (![4, 5, 6, 7].every((p) => edgeDone(cur, p))) run(buildCross(cur, "SWIFT"));
  for (let r = 0; r < 4; r++) if (!cornerDone(cur, 4 + r)) run(seatCorner(cur, r));
  for (let r = 0; r < 4; r++) if (!edgeDone(cur, 8 + r)) run(threadEdge(cur, r));
  run(orientTopEdges(cur));
  run(permuteTopEdges(cur));
  run(finishTopCorners(cur));
  return solution;
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

  // --- the move-by-move agent loop -------------------------------------------
  // Jev judges ONE move per call from the live state; history stays private.
  let state = applyMoves(solvedCube(), history);
  const startFacelets = referenceFacelets(history);
  let facelets = startFacelets;
  const soFar: Move[] = [...history];

  const { judgement, firstMove } = await judgeFirst(history, state, facelets);

  const solution: Move[] = [];
  const milestones: Milestone[] = [];
  let superhuman = false;
  let judgedCalls = 0;

  const BUDGET_MS = 30_000;
  const MAX_JUDGED_MOVES = 140;
  const budgetStart = Date.now();

  if (!judgement.live) {
    // No engine key / engine down: toolbox autopilot, same move stream.
    const degraded = await degradedSolve(state);
    milestones.push({
      at: 0,
      emoji: "🧰",
      feed: "no engine key — toolbox autopilot engaged",
    });
    solution.push(...degraded);
    state = applyMoves(state, degraded);
  } else {
    let next = firstMove;
    let lastMove: Move | null = null;
    let stalls = 0;
    let prevProgress = progressOf(state);
    const noteProgress = () => {
      const p = progressOf(state);
      const m = milestoneFor(prevProgress, p);
      if (m) {
        m.at = solution.length;
        milestones.push(m);
      }
      prevProgress = p;
    };

    while (!isSolved(state) && solution.length < MAX_JUDGED_MOVES && Date.now() - budgetStart < BUDGET_MS && stalls < 3) {
      let move = next;
      next = null;
      if (!move) {
        move = await judgeNextMove(state, facelets, solution.length + 1, lastMove ? inverseOf(lastMove) : null);
      }
      if (move && lastMove && move === inverseOf(lastMove)) {
        continue; // instant undo — wasted turn, not a failure; do not replay it
      }
      if (!move || !ALPHABET.includes(move)) {
        stalls += 1; // bad answer / engine hiccup — allow a retry or two
        continue;
      }
      judgedCalls += 1;
      solution.push(move);
      state = applyMoves(state, [move]);
      soFar.push(move);
      facelets = referenceFacelets(soFar);
      lastMove = move;
      noteProgress();
    }

    // Clock out: whatever Jev did not finish, the superhuman finisher does.
    if (!isSolved(state)) {
      superhuman = true;
      milestones.push({
        at: solution.length,
        emoji: "⚡",
        feed: "clock's out — going superhuman for the finish",
      });
      try {
        const tail = await solveKociembaFacelets(facelets ?? "");
        solution.push(...tail);
        state = applyMoves(state, tail);
      } catch {
        // fall through to the verification gate, which rewinds honestly
      }
    }
  }

  // --- verification gate: the stream must genuinely solve the cube -----------
  if (!isSolved(state) || !referenceSolvesFacelets(startFacelets ?? "", solution)) {
    solution.length = 0;
    milestones.length = 0;
    milestones.push({ at: 0, emoji: "⏪", feed: "got lazy — brute undo (should not happen)" });
    solution.push(...solveFor(history));
    superhuman = false;
  }

  const xp = xpFor(judgement, solution.length);
  // Pace the solve so it reads like the AI is thinking move-by-move, with a
  // time budget so even monster scrambles finish inside the function limit.
  // The client matches its animation to this exact pace.
  const perMove = Math.max(5, Math.min(90, Math.min(260, 36000 / solution.length)));

  // Curated gameplay events only — no provider, model, or timing metadata.
  const meta = {
    engine: ENGINE,
    solutionLength: solution.length,
    tools: judgedCalls,
    superhuman,
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

        let mi = 0;
        for (let i = 0; i < solution.length; i++) {
          while (mi < milestones.length && milestones[mi].at <= i) {
            const m = milestones[mi++];
            send("waypoint", { emoji: m.emoji, feed: m.feed });
          }
          send("move", { move: solution[i], i, n: solution.length });
          await sleep(perMove);
        }
        while (mi < milestones.length) {
          const m = milestones[mi++];
          send("waypoint", { emoji: m.emoji, feed: m.feed });
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
