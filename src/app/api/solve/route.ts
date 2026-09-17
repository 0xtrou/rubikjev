import { NextRequest } from "next/server";
import { choice, getEngineClient, noul, score } from "@/server/jev-engine";
import { parseHistory, scrambleStats, solveFor } from "@/lib/cube";
import { ROASTS, TIERS, type TierKey } from "@/lib/memes";

export const runtime = "nodejs";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// SECURITY MODEL
// - Engine credentials and endpoint live only in server env
//   (JEV_ENGINE_API_KEY / JEV_ENGINE_BASE_URL — never NEXT_PUBLIC_*, never
//   hardcoded). The raw upstream request (state, questions, criteria) and the
//   raw response (probabilities, confidence, usage, model id) NEVER leave this
//   process: no logs, no client payload. The stream only carries curated
//   gameplay events signed with our own engine name — provider infrastructure
//   is an implementation detail of this route, accessed exclusively through
//   the server-only adapter in src/server/jev-engine.ts.
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

// The judgment pass. Everything in this function is server-private.
async function judgeScramble(history: string[]): Promise<Judgement> {
  const stats = scrambleStats(history);
  const state = {
    scramble: {
      moves: history,
      totalTurns: stats.length,
      simplifiedTurns: stats.simplifiedLength,
      wastefulCancellations: stats.cancellations,
      faceDistribution: stats.faceCounts,
    },
  };

  try {
    if (!client) throw new Error("no-key");
    const response = await client.systemOne({
      state,
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
      },
    });

    const a = response.answers;
    // Raw inference (choice probabilities, confidence, rubric, usage, model id)
    // stays inside this function by design.
    const tier = (a.chaos_tier?.choice ?? "MID") as TierKey;
    const stars = Math.min(5, Math.max(1, Math.round((a.difficulty?.score ?? 2) + 1)));
    const chaos = (a.genuine_chaos?.noul ?? 0.5) > 0.6;
    const roasts = ROASTS[tier];
    return {
      tier,
      stars,
      roast: roasts[stats.length % roasts.length],
      chaos,
      // Generic usage metering only — no model id, no latency telemetry.
      tokens: response.usage.input_tokens + response.usage.output_tokens,
      live: true,
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
      tier,
      stars,
      roast: roasts[stats.length % roasts.length],
      chaos: stats.cancellations === 0,
      tokens: 0,
      live: false,
    };
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

  const solution = solveFor(history);
  const judgement = await judgeScramble(history);
  const xp = xpFor(judgement, solution.length);
  // Curated gameplay events only — no provider, model, or latency metadata.
  const meta = {
    engine: ENGINE,
    solutionLength: solution.length,
    tier: judgement.tier,
    tierLabel: TIERS[judgement.tier].label,
    tierEmoji: TIERS[judgement.tier].emoji,
    stars: judgement.stars,
    roast: judgement.roast,
    chaos: judgement.chaos,
    tokens: judgement.tokens,
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

        // Pace the solve so it reads like the AI is thinking move-by-move,
        // with a time budget so even monster scrambles finish inside the
        // function limit.
        const ideal = Math.max(90, Math.min(260, 3600 / solution.length));
        const perMove = Math.max(5, Math.min(ideal, 45000 / solution.length));
        for (let i = 0; i < solution.length; i++) {
          send("move", { move: solution[i], i, n: solution.length });
          await sleep(perMove);
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
