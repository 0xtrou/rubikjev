import { NextRequest } from "next/server";
import { choice, getEngineClient, noul, score } from "@/server/jev-engine";
import { parseHistory, scrambleStats, type Move } from "@/lib/cube";
import { applyMoves, solvedCube, isSolved } from "@/lib/cubie";
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
//   • HONESTY: if the engine is not ready, nothing is streamed and the cube
//     never rotates; if Jev cannot finish, the stream ends failed — the only
//     non-Jev moves that ever stream are the superhuman tool's, and only when
//     Jev itself chose to invoke it (tagged "tool" in the stream)
// ---------------------------------------------------------------------------

const client = getEngineClient();

// Public engine signature — ours, deliberately provider-agnostic.
const ENGINE = "jev-stream/1";

// The move alphabet — Jev's complete action space, declared once.
const ALPHABET: Move[] = ["U", "D", "L", "R", "F", "B"].flatMap((f) => [f, (f + "'") as Move, (f + "2") as Move]);

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

// Options are shuffled every call: a judgment model favors early options, and
// a fixed order would have it playing the same face forever.
const shuffled = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Legal, non-degenerate candidates for one judged turn: no instant undo, and
// no third consecutive turn of the same face (U U U is a null lap).
function candidateMoves(lastMoves: Move[]): Move[] {
  const last = lastMoves[lastMoves.length - 1];
  const prev = lastMoves[lastMoves.length - 2];
  return ALPHABET.filter((m) => {
    if (last && m === inverseOf(last)) return false;
    if (last && prev && m[0] === last[0] && last[0] === prev[0]) return false;
    return true;
  });
}

const SPEEDRUN_PICK = "__speedrun__";

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

  const optionsOf = (moves: Move[]) =>
    Object.fromEntries(moves.map((m) => [m, m === SPEEDRUN_PICK ? "Go superhuman: finish the whole cube near-optimally (you may invoke this tool)." : `Play ${m}.`]));

  // No catch on purpose: if the engine is not ready, the route answers 503 and
  // NOTHING is streamed — the cube never rotates for a solve Jev did not judge.
  if (!client) throw new Error("jev-not-ready");
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
        optionsOf(shuffled([...ALPHABET, SPEEDRUN_PICK]))
      ),
    },
  });

  const a = response.answers;
  // Raw inference (choice probabilities, confidence, rubric, usage, model id)
  // stays inside this function by design.
  const tier = (a.chaos_tier?.choice ?? "MID") as TierKey;
  const stars = Math.min(5, Math.max(1, Math.round((a.difficulty?.score ?? 2) + 1)));
  const chaos = (a.genuine_chaos?.noul ?? 0.5) > 0.6;
  const firstPick = a.first_move?.choice as Move;
  const firstMove = firstPick === SPEEDRUN_PICK
    ? SPEEDRUN_PICK
    : ALPHABET.includes(firstPick) ? firstPick : null;
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
}

// Later turns: Jev sees the fresh state and judges the next single move — or
// invokes the superhuman tool itself (SPEEDRUN_PICK, an honest delegation).
async function judgeNextMove(
  state: ReturnType<typeof applyMoves>,
  facelets: string | null,
  turn: number,
  lastMoves: Move[],
): Promise<Move | typeof SPEEDRUN_PICK | null> {
  try {
    if (!client) throw new Error("jev-not-ready");
    const options = shuffled([...candidateMoves(lastMoves), SPEEDRUN_PICK]);
    const response = await client.systemOne({
      state: {
        cube: {
          facelets,
          progress: progressOf(state),
          yourLastMoves: lastMoves.slice(-3),
          note: `Live cube after turn ${turn}. Play exactly one move from your alphabet — or invoke the superhuman tool if you want it finished for you.`,
        },
      },
      questions: {
        next_move: choice(
          "You are Jev, dismantling the cube one move per turn. Which single move do you play now?",
          Object.fromEntries(options.map((m) => [m, m === SPEEDRUN_PICK ? "Go superhuman: finish the whole cube near-optimally (you may invoke this tool)." : `Play ${m}.`]))
        ),
      },
    });
    const picked = response.answers.next_move?.choice as Move;
    if (picked === SPEEDRUN_PICK) return SPEEDRUN_PICK;
    const cands = candidateMoves(lastMoves);
    return cands.includes(picked) ? picked : null;
  } catch {
    return null; // engine hiccup this turn — the loop may retry, honestly
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
  // HONESTY RULE: the cube only ever rotates moves Jev actually judged (or the
  // superhuman tool Jev itself chose to invoke, tagged "tool"). If the engine
  // is not ready, this route answers 503 and streams NOTHING. If Jev cannot
  // finish, the stream ends honestly failed — no substitute solver spins the
  // cube on Jev's behalf.
  let state = applyMoves(solvedCube(), history);
  const startFacelets = referenceFacelets(history);
  let facelets = startFacelets;
  const soFar: Move[] = [...history];

  let judgement: Judgement;
  let firstMove: Move | typeof SPEEDRUN_PICK | null;
  try {
    const first = await judgeFirst(history, state, facelets);
    judgement = first.judgement;
    firstMove = first.firstMove;
  } catch {
    return Response.json(
      { error: "Jev isn't ready — and nothing rotates the cube without Jev." },
      { status: 503 }
    );
  }

  const solution: { move: Move; by: "jev" | "tool" }[] = [];
  const milestones: Milestone[] = [];
  let superhuman = false;
  let judgedCalls = 0;

  const BUDGET_MS = 30_000;
  const MAX_JUDGED_MOVES = 140;
  const MAX_MOVES_WITHOUT_PROGRESS = 20;
  const budgetStart = Date.now();

  if (!isSolved(state)) {
    let next: Move | typeof SPEEDRUN_PICK | null = firstMove;
    let lastMove: Move | null = null;
    let stalls = 0;
    let judgedSinceProgress = 0;
    let prevProgress = progressOf(state);
    const noteProgress = () => {
      const p = progressOf(state);
      const m = milestoneFor(prevProgress, p);
      if (m) {
        m.at = solution.length;
        milestones.push(m);
        judgedSinceProgress = 0;
      }
      prevProgress = p;
    };

    while (
      !isSolved(state) &&
      solution.length < MAX_JUDGED_MOVES &&
      judgedSinceProgress < MAX_MOVES_WITHOUT_PROGRESS &&
      Date.now() - budgetStart < BUDGET_MS &&
      stalls < 3
    ) {
      let pick = next;
      next = null;
      if (!pick) {
        pick = await judgeNextMove(state, facelets, solution.length + 1, soFar.slice(-6));
      }
      if (pick === SPEEDRUN_PICK) {
        // Jev's own choice to delegate — tagged honestly as tool moves.
        superhuman = true;
        judgedCalls += 1;
        milestones.push({
          at: solution.length,
          emoji: "⚡",
          feed: "JEV called the superhuman finisher — the rest is its tool, not its judgment",
        });
        try {
          const tail = await solveKociembaFacelets(facelets ?? "");
          for (const m of tail) {
            solution.push({ move: m, by: "tool" });
            state = applyMoves(state, [m]);
            soFar.push(m);
          }
          facelets = referenceFacelets(soFar);
        } catch {
          // tool failed mid-delegation → honest stop, nothing else rotates
        }
        break;
      }
      if (pick && lastMove && pick === inverseOf(lastMove)) {
        continue; // instant undo — skipped, never executed
      }
      if (!pick || !ALPHABET.includes(pick)) {
        stalls += 1; // bad answer / engine hiccup — a retry or two, then honest fail
        continue;
      }
      judgedCalls += 1;
      judgedSinceProgress += 1;
      solution.push({ move: pick, by: "jev" });
      state = applyMoves(state, [pick]);
      soFar.push(pick);
      facelets = referenceFacelets(soFar);
      lastMove = pick;
      noteProgress();
    }
  }

  // --- verification gate: a claimed solve must genuinely solve ---------------
  const solved = isSolved(state);
  if (solved && !referenceSolvesFacelets(startFacelets ?? "", solution.map((s) => s.move))) {
    // Internal inconsistency — refuse to stream rather than fake a win.
    return Response.json({ error: "verification failed — nothing streamed" }, { status: 500 });
  }

  const xp = solved ? xpFor(judgement, solution.length) : 0;
  // Pace the solve so it reads like the AI is thinking move-by-move, with a
  // time budget so even monster scrambles finish inside the function limit.
  // The client matches its animation to this exact pace.
  const perMove = Math.max(5, Math.min(90, Math.min(260, 36000 / Math.max(1, solution.length))));

  // Curated gameplay events only — no provider, model, or timing metadata.
  const meta = {
    engine: ENGINE,
    solutionLength: solution.length,
    tools: judgedCalls,
    superhuman,
    solved,
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
          send("move", { move: solution[i].move, by: solution[i].by, i, n: solution.length });
          await sleep(perMove);
        }
        while (mi < milestones.length) {
          const m = milestones[mi++];
          send("waypoint", { emoji: m.emoji, feed: m.feed });
        }

        send("done", { xp, solved });
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
