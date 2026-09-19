"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { randomScramble, type Move } from "@/lib/cube";
import { BADGES, HYPE_LINES, RANKS, TIERS, rankFor, type TierKey } from "@/lib/memes";
import { useGame, type BenchEntry } from "@/lib/store";
import type { CubeApi } from "@/components/cube/RubiksCube";
import LegalChrome from "@/components/legal";
import Logo from "@/components/Logo";
import SafeBoundary from "@/components/ErrorBoundary";
import { initSfx, setSfxMuted, sfx } from "@/lib/sfx";
import SocialLinks from "@/components/SocialLinks";

const CubeStage = dynamic(() => import("@/components/cube/CubeStage"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-4xl animate-bounce">🧊</div>
  ),
});

type Phase = "idle" | "scrambling" | "ready" | "solving" | "solved";
type Meta = {
  engine: string;
  solutionLength: number;
  tools: number;
  superhuman: boolean;
  solved: boolean;
  thinkMs: number;
  toolMs: number;
  tier: TierKey;
  tierLabel: string;
  tierEmoji: string;
  stars: number;
  roast: string;
  chaos: boolean;
  tokens: number;
  paceMs: number;
  xp: number;
};
type Gamble = {
  base: number;
  stage: "offer" | "spinning" | "result";
  mult: number;
  reels: string[];
};

const SCRAMBLE_PRESETS = [
  { label: "Chill", moves: 10, emoji: "😌" },
  { label: "Spicy", moves: 18, emoji: "🌶️" },
  { label: "GIGACHAD", moves: 25, emoji: "🗿" },
  { label: "UNHINGED", moves: 100, emoji: "🤯" },
];

const MANUAL_MOVES: Move[] = [
  "U", "U'", "D", "D'", "L", "L'", "R", "R'", "F", "F'", "B", "B'",
];

const MAX_TURNS = 5000;
const REEL_EMOJIS = ["🗿", "👨‍🍳", "😌", "🤖", "🌿", "⭐"];
const randReel = () => REEL_EMOJIS[Math.floor(Math.random() * REEL_EMOJIS.length)];

// Slot outcome: slightly house-favored, occasionally legendary.
function spinOutcome(): { mult: number; reels: string[] } {
  const r = Math.random();
  if (r < 0.02) return { mult: 10, reels: ["⭐", "⭐", "⭐"] };
  if (r < 0.06) return { mult: 5, reels: ["🗿", "🗿", "🗿"] };
  if (r < 0.14) {
    const e = randReel();
    return { mult: 3, reels: [e, e, e] };
  }
  if (r < 0.34) {
    const a = randReel();
    let b = randReel();
    while (b === a) b = randReel();
    const pair = [a, a, b];
    if (Math.random() < 0.5) pair.reverse();
    return { mult: 2, reels: pair };
  }
  const s = [...REEL_EMOJIS].sort(() => Math.random() - 0.5);
  return { mult: 0, reels: [s[0], s[1], s[2]] };
}

let feedId = 0;
const FEED_CAP = 160; // the live feed keeps the whole run's stream (scrollable)

const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`);

// Full victory sequence: center burst + side cannons + star wave.
function fireVictory() {
  confetti({
    particleCount: 150,
    spread: 110,
    startVelocity: 48,
    origin: { y: 0.62 },
    scalar: 1.05,
    zIndex: 90,
  });
  const end = Date.now() + 1600;
  const cannons = () => {
    confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0, y: 0.72 }, zIndex: 90 });
    confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1, y: 0.72 }, zIndex: 90 });
    if (Date.now() < end) requestAnimationFrame(cannons);
  };
  cannons();
  setTimeout(() => {
    confetti({
      particleCount: 70,
      spread: 130,
      startVelocity: 32,
      shapes: ["star"],
      scalar: 1.25,
      origin: { y: 0.45 },
      zIndex: 90,
    });
  }, 350);
}

export default function Home() {
  const cubeRef = useRef<CubeApi>(null);
  const historyRef = useRef<Move[]>([]);
  const celebrateRef = useRef(false);
  const solveStartRef = useRef(0);
  const metaRef = useRef<Meta | null>(null);
  const gambleBaseRef = useRef(0);
  const streamedRef = useRef<Move[]>([]);
  const solvedRef = useRef(true);
  const cumThinkRef = useRef(0);
  const [thinkSoFar, setThinkSoFar] = useState(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [resetKey, setResetKey] = useState(0);
  const [preset, setPreset] = useState(1);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [feed, setFeed] = useState<{ id: number; text: string }[]>([]);
  const [audit, setAudit] = useState<{ i: number; move: Move; by: "scramble" | "jev" | "tool" }[]>([]);
  const [hype, setHype] = useState(HYPE_LINES[0]);
  const [tab, setTab] = useState("play");
  const [turn, setTurn] = useState<number | null>(null);
  const [customTurns, setCustomTurns] = useState(25);
  const [gamble, setGamble] = useState<Gamble | null>(null);
  const [solvedStats, setSolvedStats] = useState<{ solveMs: number; moves: number; tokens: number; thinkMs: number } | null>(null);
  const [muted, setMuted] = useState(false);

  const { xp, solves, badges, bench, addXp, recordSolve, awardBadge, addBench } = useGame();
  const { rank, next } = rankFor(xp);

  const say = useCallback((text: string) => {
    setFeed((f) => [{ id: ++feedId, text }, ...f].slice(0, FEED_CAP));
  }, []);

  // Audio: unlock the context on the first user gesture.
  useEffect(() => {
    const unlock = () => initSfx();
    window.addEventListener("pointerdown", unlock, { once: true });
    try {
      setSfxMuted(localStorage.getItem("jev-muted") === "1");
      setMuted(localStorage.getItem("jev-muted") === "1");
    } catch {
      // ignore
    }
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const toggleMute = useCallback(() => {
    initSfx();
    setMuted((m) => {
      const next = !m;
      setSfxMuted(next);
      try {
        localStorage.setItem("jev-muted", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (phase !== "solving") return;
    const t = setInterval(() => {
      setHype(HYPE_LINES[Math.floor(Math.random() * HYPE_LINES.length)]);
    }, 1400);
    return () => clearInterval(t);
  }, [phase]);

  // Slot reels animation while gambling.
  useEffect(() => {
    if (gamble?.stage !== "spinning") return;
    const iv = setInterval(() => {
      sfx.spinTick();
      setGamble((g) => (g ? { ...g, reels: [randReel(), randReel(), randReel()] } : g));
    }, 90);
    const stop = setTimeout(() => {
      const out = spinOutcome();
      setGamble((g) => (g ? { ...g, ...out, stage: "result" } : g));
      const won = gambleBaseRef.current * out.mult;
      addXp(won);
      if (out.mult === 0) {
        sfx.bust();
        say(`💀 gambled ${gambleBaseRef.current} XP and LOST IT ALL. bold.`);
        toast("BUST 💀 the house always wins");
      } else {
        sfx.coins();
        say(`🎰 slot says ×${out.mult} → +${won} XP!`);
        if (out.mult >= 3) {
          toast(`🎰 ×${out.mult} MULTIPLIER!!! +${won} XP 🤑`);
          sfx.fanfare();
          confetti({ particleCount: 220, spread: 130, origin: { y: 0.6 }, zIndex: 95 });
        }
      }
    }, 1700);
    return () => {
      clearInterval(iv);
      clearTimeout(stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamble?.stage]);

  const busy = phase === "scrambling" || phase === "solving";
  const locked = busy || gamble !== null;

  const beginGamble = (base: number) => {
    gambleBaseRef.current = base;
    setGamble({ base, stage: "offer", mult: 1, reels: [randReel(), randReel(), randReel()] });
  };

  const bankIt = () => {
    if (!gamble) return;
    sfx.coins();
    addXp(gamble.base);
    say(`🏦 banked ${gamble.base} XP. sensible.`);
    setGamble(null);
  };

  const gambleIt = () => {
    sfx.click();
    setGamble((g) => (g ? { ...g, stage: "spinning" } : g));
  };

  const collectGamble = () => {
    if (!gamble) return;
    sfx.click();
    if (gamble.mult > 0) say(`🧾 collected +${gamble.base * gamble.mult} XP. we move.`);
    setGamble(null);
  };

  const scramble = useCallback(() => {
    if (locked || !cubeRef.current) return;
    initSfx();
    sfx.whoosh();
    const moves = randomScramble(SCRAMBLE_PRESETS[preset].moves);
    historyRef.current = moves;
    setAudit(moves.map((m, idx) => ({ i: idx + 1, move: m, by: "scramble" as const })));
    setMeta(null);
    setTurn(null);
    setSolvedStats(null);
    setPhase("scrambling");
    cubeRef.current.resetTurns();
    say(`scrambling with ${moves.length} moves of pure chaos…`);
    cubeRef.current.enqueue(moves, "fast");
    cubeRef.current.onSettled(() => {
      setPhase("ready");
      say("scramble locked in. yo @Jev, cook this 🧑‍🍳");
    });
  }, [locked, preset, say]);

  const solve = useCallback(async () => {
    if (locked || !cubeRef.current) return;
    if (historyRef.current.length === 0) {
      toast("the cube is already solved, genius 😎");
      return;
    }
    setPhase("solving");
    celebrateRef.current = true;
    solveStartRef.current = Date.now();
    metaRef.current = null;
    initSfx();
    // The turn counter and the replay are driven by the cube's animation,
    // not the network: the stream buffers, the cube pulls when free.
    cubeRef.current.resetTurns();
    cubeRef.current.onTurn((i) => setTurn(i));
    cubeRef.current.clearPending();
    setTurn(null);
    streamedRef.current = [];
    solvedRef.current = true;
    cumThinkRef.current = 0;
    setThinkSoFar(0);
    say("waking Jev up… ☕");

    try {
      const res = await fetch("/api/solve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ history: historyRef.current }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        toast(err.error ?? "Jev tripped on a LAN cable 🙃");
        celebrateRef.current = false;
        setPhase("ready");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handle = (event: string, data: string) => {
        const payload = JSON.parse(data);
        if (event === "meta") {
          // Verdict is sealed here but only revealed once the cube animation
          // settles — no spoilers mid-solve.
          const m = payload as Meta;
          metaRef.current = m;
          cubeRef.current?.setPace(m.paceMs);
        } else if (event === "waypoint") {
          // Jev chose this job mid-solve — narrate the pave-the-way moment.
          say(`${payload.emoji} JEV: ${payload.feed}`);
        } else if (event === "move") {
          // Buffered, then animated the moment the cube is free — the tick
          // fires with the actual turn (see RubiksCube.startMove).
          cubeRef.current?.feedMove(payload.move);
          // Raw move stream: EVERY streamed move gets its own feed line,
          // honestly tagged — 🧠 judged by Jev, ⚡ the tool Jev chose to invoke.
          streamedRef.current.push(payload.move);
          setAudit((a) => [...a, { i: a.length + 1, move: payload.move, by: payload.by === "tool" ? "tool" : "jev" }]);
          // Real per-move thinking time, measured server-side around the
          // judgment call — tool moves carry none (thinkMs 0).
          cumThinkRef.current += payload.thinkMs;
          setThinkSoFar(cumThinkRef.current);
          setFeed((f) => [
            {
              id: ++feedId,
              text: payload.by === "tool"
                ? `⚡ ${payload.i + 1}·${payload.move} (tool)`
                : `🧠 ${payload.i + 1}·${payload.move} — ${(payload.thinkMs / 1000).toFixed(2)}s think`,
            },
            ...f,
          ].slice(0, FEED_CAP));
        } else if (event === "done") {
          if (!payload.solved) {
            // Jev could not finish — own it. The cube keeps its true state
            // (Jev's real moves stay applied); no XP, no gamble, no confetti.
            solvedRef.current = false;
            celebrateRef.current = false;
            historyRef.current.push(...streamedRef.current);
            say("🤷 Jev tapped out — it couldn't finish this one. every move played was really its call.");
            toast("Jev couldn't solve it this time 🤷");
            return;
          }
          const firstEver = solves === 0;
          const scrambleMoves = historyRef.current.length;
          recordSolve(scrambleMoves);
          if (firstEver) awardBadge("first_blood");
          if (scrambleMoves >= 25) awardBadge("chaos_agent");
          awardBadge("speedrun");
          if (useGame.getState().xp >= RANKS[RANKS.length - 1].minXp) awardBadge("sigma");
          historyRef.current = [];
          // Gamble offer is staged now but only presented after the cube
          // animation settles (see onSettled).
          gambleBaseRef.current = payload.xp;
          say(`run solved 🧾 +${payload.xp} XP on the table — bank it or gamble?`);
        } else if (event === "error") {
          toast(payload.message);
          celebrateRef.current = false;
          setPhase("ready");
        }
      };

      // Parse the SSE stream incrementally.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const lines = part.split("\n");
          const evLine = lines.find((l) => l.startsWith("event: "));
          const dataLine = lines.find((l) => l.startsWith("data: "));
          if (evLine && dataLine) handle(evLine.slice(7), dataLine.slice(6));
        }
      }

      cubeRef.current.onSettled(() => {
        if (!solvedRef.current) {
          setPhase("ready");
          return;
        }
        setPhase("solved");
        const m = metaRef.current;
        if (m) {
          const solveMs = Date.now() - solveStartRef.current;
          addBench({
            at: Date.now(),
            moves: m.solutionLength,
            stars: m.stars,
            tokens: m.tokens,
            solveMs,
            xp: m.xp,
            thinkMs: m.thinkMs,
          });
          setSolvedStats({ solveMs, moves: m.solutionLength, tokens: m.tokens, thinkMs: m.thinkMs });
          // Reveal the sealed verdict now that the cube is visibly solved.
          setMeta(m);
          sfx.verdict();
          say(`${m.tierEmoji} JEV VERDICT: ${m.tierLabel} — ${"⭐".repeat(m.stars)}`);
          say(m.roast);
          if (m.tokens > 0) say(`🎫 ${m.tokens} tokens burned by the Jev engine`);
          if (m.tier === "GIGACHAD_SCRAMBLE") awardBadge("gigachad_scramble");
        }
        if (celebrateRef.current) {
          celebrateRef.current = false;
          sfx.fanfare();
          fireVictory();
          cubeRef.current?.celebrate();
        }
        setTab("stats");
        // Present the gamble only after the victory spin has played out.
        setTimeout(() => beginGamble(gambleBaseRef.current), 2400);
      });
    } catch {
      toast("connection to Jev lost mid-cook 📡");
      celebrateRef.current = false;
      setPhase("ready");
    }
  }, [locked, say, recordSolve, awardBadge, addBench, solves]);

  const pushTurns = useCallback(
    (moves: Move[]) => {
      if (busy || !cubeRef.current) return;
      const room = MAX_TURNS - historyRef.current.length;
      if (room <= 0) {
        toast("5000 turns is the universe's limit 🌌");
        return;
      }
      const applied = moves.slice(0, room);
      historyRef.current.push(...applied);
      setAudit((a) => [...a, ...applied.map((m, idx) => ({ i: a.length + idx + 1, move: m, by: "scramble" as const }))]);
      setMeta(null);
      if (phase === "solved" || phase === "idle") setPhase("ready");
      cubeRef.current.enqueue(applied, "fast");
    },
    [busy, phase]
  );

  const manualTurn = useCallback(
    (move: Move) => {
      if (locked) return;
      initSfx();
      sfx.tick();
      pushTurns([move]);
    },
    [locked, pushTurns]
  );

  const unleashTurns = useCallback(() => {
    if (locked) return;
    initSfx();
    sfx.whoosh();
    const room = MAX_TURNS - historyRef.current.length;
    if (room <= 0) {
      toast("5000 turns is the universe's limit 🌌");
      return;
    }
    const n = Math.max(1, Math.min(Math.floor(customTurns) || 0, room, 4900));
    pushTurns(randomScramble(n));
    say(`human unleashed ${n} more turns 🌪️`);
  }, [locked, customTurns, pushTurns, say]);

  const reset = useCallback(() => {
    if (locked) return;
    historyRef.current = [];
    setMeta(null);
    setTurn(null);
    setSolvedStats(null);
    setAudit([]);
    cubeRef.current?.clearPending();
    setPhase("idle");
    setResetKey((k) => k + 1);
    say("cube rehab complete. fresh start 💫");
  }, [locked, say]);

  const rankProgress = next ? ((xp - rank.minXp) / (next.minXp - rank.minXp)) * 100 : 100;
  const latest = bench[0];

  return (
    <div className="bg-background text-foreground lg:h-dvh lg:overflow-hidden flex flex-col">
      <div className="mx-auto w-full max-w-7xl px-3 sm:px-6 py-3 flex flex-col flex-1 lg:min-h-0 gap-3">
        {/* Header — compact single row */}
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h1 className="flex items-center gap-2 font-heading text-3xl sm:text-4xl font-bold tracking-wide leading-none">
            <Logo className="h-9 w-9 drop-shadow-[0_0_14px_rgba(59,130,246,0.45)]" />
            <span className="bg-gradient-to-r from-emerald-400 via-sky-400 to-fuchsia-500 bg-clip-text text-transparent">
              JEV SOLVES THE CUBE
            </span>
            <span className="text-muted-foreground text-sm sm:text-base font-sans font-medium hidden sm:inline">
              — you scramble, Jev™ cooks. no takebacks.
            </span>
          </h1>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground"
            >
              experimental · ai
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 rounded-full p-0 text-sm"
              onClick={toggleMute}
              title={muted ? "unmute sounds" : "mute sounds"}
            >
              {muted ? "🔇" : "🔊"}
            </Button>
            <SocialLinks />
          </div>
        </header>

        {/* HUD — ultra-slim single line */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card/60 px-3 py-1 text-xs">
          <span className="text-base">{rank.emoji}</span>
          <span className="font-heading text-base leading-none">{rank.name}</span>
          <Separator orientation="vertical" className="hidden h-4 sm:block" />
          <div className="flex min-w-28 sm:min-w-48 flex-1 items-center gap-2">
            <span className="text-[10px] text-muted-foreground">{xp} XP</span>
            <Progress value={rankProgress} className="h-1 flex-1" />
            <span className="text-[10px] text-muted-foreground">
              {next ? `${next.minXp - xp} XP → ${next.name}` : "MAXED 🌿"}
            </span>
          </div>
          <Separator orientation="vertical" className="hidden h-4 sm:block" />
          <span className="text-[10px] text-muted-foreground">
            <span className="font-black text-foreground">{solves}</span> 🧾 solves
          </span>
          <Separator orientation="vertical" className="hidden h-4 sm:block" />
          <div className="flex gap-0.5">
            {Object.entries(BADGES).map(([key, b]) => (
              <span
                key={key}
                title={`${b.label}: ${b.desc}`}
                className={`text-sm transition ${badges.includes(key as never) ? "" : "opacity-20 grayscale"}`}
              >
                {b.emoji}
              </span>
            ))}
          </div>
        </div>

        {/* Main row: cube + right column */}
        <div className="grid flex-1 lg:min-h-0 gap-3 lg:grid-cols-[1.2fr_1fr]">
          {/* Cube — fills available height, never scrolls */}
          <Card className={`overflow-hidden border-2 min-h-[300px] lg:min-h-0 ${phase === "scrambling" ? "cube-shake" : ""}`}>
            <div className="relative h-full min-h-[300px] lg:min-h-0">
              <CubeStage cubeRef={cubeRef} resetKey={resetKey} />
              {phase === "solving" && (
                <div className="pointer-events-none absolute inset-x-0 top-0 p-2 z-10">
                  <div className="mx-auto w-fit rounded-full bg-black/70 px-4 py-1.5 text-xs font-bold text-emerald-300 backdrop-blur">
                    🧠 <span className="font-mono text-base text-emerald-200">{(thinkSoFar / 1000).toFixed(1)}s</span>
                    <span className="text-emerald-300"> thinking</span> · {hype}
                  </div>
                </div>
              )}
              {phase === "solved" && !gamble && solvedStats && (
                <div className="pointer-events-none absolute inset-x-0 top-0 p-2 z-10">
                  <div className="victory-pop mx-auto w-fit rounded-xl border border-amber-400/50 bg-black/80 px-5 py-2.5 text-center backdrop-blur">
                    <div className="font-heading text-2xl font-bold leading-none text-amber-300">
                      ✅ SOLVED!
                    </div>
                    <div className="mt-1.5 flex items-center justify-center gap-3 font-mono text-[11px] text-muted-foreground">
                      <span className="font-bold text-emerald-300">🧠 {(solvedStats.thinkMs / 1000).toFixed(1)}s think</span>
                      <span>⏱ {fmtMs(solvedStats.solveMs)}</span>
                      <span>🔄 {solvedStats.moves} turns</span>
                      <span>🎫 {solvedStats.tokens.toLocaleString()} tok</span>
                    </div>
                  </div>
                </div>
              )}
              {/* turns counter — only while Jev is solving */}
              {phase === "solving" && turn !== null && (
                <div className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-md bg-black/70 px-2.5 py-0.5 font-mono text-[11px] font-bold text-emerald-300 backdrop-blur">
                  TURN {turn}
                </div>
              )}
              {/* reset — lives with the cube it resurrects */}
              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                disabled={locked}
                className="absolute bottom-2 right-2 z-20 h-7 rounded-md bg-black/70 px-2.5 font-mono text-[11px] font-bold text-rose-300 backdrop-blur hover:bg-black/80 hover:text-rose-200"
              >
                🚿 reset
              </Button>

              {/* JEV'S GAMBIT — double or nothing */}
              {gamble && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                  <div className="w-full max-w-sm rounded-xl border-2 border-amber-400/60 bg-popover/95 p-4 text-center shadow-2xl animate-in fade-in zoom-in-90 duration-300">
                    <div className="font-heading text-3xl font-bold text-amber-300">🎰 JEV&apos;S GAMBIT</div>
                    {gamble.stage === "offer" && (
                      <>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                          run complete — <span className="font-bold text-foreground">+{gamble.base} XP</span> on
                          the table. bank it, or let fate decide?
                        </p>
                        <div className="mt-3 flex justify-center gap-2">
                          <Button variant="outline" size="sm" onClick={bankIt}>
                            🏦 bank {gamble.base}
                          </Button>
                          <Button
                            size="sm"
                            onClick={gambleIt}
                            className="bg-gradient-to-r from-amber-500 to-fuchsia-500 text-white hover:from-amber-600 hover:to-fuchsia-600"
                          >
                            🎲 double or nothing
                          </Button>
                        </div>
                        <p className="mt-2 text-[10px] text-muted-foreground">
                          ×2 common · ×3 rare · ×5 very rare · ×10 legendary · 💀 bust = nothing
                        </p>
                      </>
                    )}
                    {gamble.stage === "spinning" && (
                      <>
                        <div className="mt-1 flex justify-center gap-3 text-5xl">
                          {gamble.reels.map((r, i) => (
                            <span key={i} className="animate-pulse">
                              {r}
                            </span>
                          ))}
                        </div>
                        <p className="mt-2 font-mono text-sm text-muted-foreground animate-pulse">spinning…</p>
                      </>
                    )}
                    {gamble.stage === "result" && (
                      <>
                        <div className="mt-1 flex justify-center gap-3 text-5xl">
                          {gamble.reels.map((r, i) => (
                            <span key={i}>{r}</span>
                          ))}
                        </div>
                        {gamble.mult === 0 ? (
                          <p className="mt-2 font-heading text-3xl font-bold text-rose-400 animate-in fade-in zoom-in-90">
                            💀 BUST!
                          </p>
                        ) : (
                          <p className="mt-2 font-heading text-3xl font-bold text-emerald-300 animate-in fade-in zoom-in-90">
                            ×{gamble.mult} → +{gamble.base * gamble.mult} XP 🤑
                          </p>
                        )}
                        <Button size="sm" className="mt-3" onClick={collectGamble}>
                          collect & continue
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Right column: tabs (play/stats/about) + verdict pinned under the input */}
          <div className="flex flex-col gap-3 lg:min-h-0">
            <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 lg:min-h-0">
              <TabsList className="grid w-full grid-cols-4 mb-2">
                <TabsTrigger value="play">🎮 Play</TabsTrigger>
                <TabsTrigger value="stats">📊 Stats</TabsTrigger>
                <TabsTrigger value="audit">📜 Audit</TabsTrigger>
                <TabsTrigger value="about">🧠 About Jev</TabsTrigger>
              </TabsList>

              <TabsContent value="play" className="mt-0 flex-1 lg:min-h-0 lg:overflow-y-auto">
                <Card className="border-2">
                  <CardHeader className="pb-2 pt-3">
                    <CardTitle className="font-heading text-xl">🎮 your move, human</CardTitle>
                  </CardHeader>
                <CardContent className="flex flex-col gap-3 px-5 py-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {SCRAMBLE_PRESETS.map((p, i) => (
                        <Button
                          key={p.label}
                          size="sm"
                          variant={preset === i ? "default" : "outline"}
                          onClick={() => setPreset(i)}
                          disabled={locked}
                          className="text-xs"
                        >
                          {p.emoji} {p.label}
                        </Button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button onClick={scramble} disabled={locked} className="font-heading text-2xl h-10">
                        🌪️ SCRAMBLE
                      </Button>
                      <Button
                        onClick={solve}
                        disabled={locked || phase === "idle"}
                        className="font-heading text-2xl h-10 bg-gradient-to-r from-emerald-500 to-sky-500 text-white hover:from-emerald-600 hover:to-sky-600"
                      >
                        🤖 SOLVE WITH JEV
                      </Button>
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-muted-foreground">
                        hand-scramble — unlimited turns, as chaotic as you dare
                      </div>
                      <div className="grid grid-cols-6 gap-1">
                        {MANUAL_MOVES.map((m) => (
                          <Button
                            key={m}
                            size="sm"
                            variant="secondary"
                            className="px-0 font-mono text-[11px] h-8"
                            disabled={locked}
                            onClick={() => manualTurn(m)}
                          >
                            {m}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-muted-foreground">
                        or unleash a custom number of turns (1–4900)
                      </div>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={4900}
                          value={customTurns}
                          onChange={(e) => setCustomTurns(Number(e.target.value))}
                          className="font-mono text-sm h-9"
                          disabled={locked}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") unleashTurns();
                          }}
                        />
                        <Button variant="secondary" size="sm" className="h-9" onClick={unleashTurns} disabled={locked}>
                          🌀 unleash
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="stats" className="mt-0 flex-1 lg:min-h-0 lg:overflow-y-auto">
                <Card className="border-2">
                  <CardHeader className="pb-2 pt-3">
                    <CardTitle className="font-heading text-xl">📊 JEV RUN STATS</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SafeBoundary storageKey="jev-cube-game">
                      {latest ? (
                        <>
                          <div className="grid grid-cols-2 gap-1.5">
                            {[
                              { label: "verdict", value: "⭐".repeat(latest.stars), emoji: "" },
                              { label: "tokens burned", value: (latest.tokens ?? 0).toLocaleString(), emoji: "🎫" },
                              { label: "run wall", value: fmtMs(latest.solveMs), emoji: "⏱️" },
                              { label: "moves", value: String(latest.moves), emoji: "🔄" },
                              { label: "jev thinking", value: `${(latest.thinkMs / 1000).toFixed(1)}s`, emoji: "🧠" },
                            ].map((s) => (
                              <div key={s.label} className="rounded-md border bg-card px-2 py-1.5">
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
                                <div className="font-mono text-xs font-bold truncate" title={s.value}>
                                  {s.emoji} {s.value}
                                </div>
                              </div>
                            ))}
                          </div>
                          {bench.length > 1 && (
                            <div className="mt-2 overflow-x-auto">
                              <table className="w-full text-left font-mono text-[11px] whitespace-nowrap">
                                <thead className="text-muted-foreground">
                                  <tr>
                                    <th className="pr-2 font-medium">time</th>
                                    <th className="pr-2 font-medium">moves</th>
                                    <th className="pr-2 font-medium">stars</th>
                                    <th className="pr-2 font-medium">tokens</th>
                                    <th className="pr-2 font-medium">think</th>
                                    <th className="pr-2 font-medium">wall</th>
                                    <th className="font-medium">XP</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {bench.map((b: BenchEntry) => (
                                    <tr key={b.at} className="border-t border-border/60">
                                      <td className="pr-2 py-0.5">
                                        {new Date(b.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                      </td>
                                      <td className="pr-2 py-0.5">{b.moves}</td>
                                      <td className="pr-2 py-0.5">{"⭐".repeat(b.stars)}</td>
                                      <td className="pr-2 py-0.5">{(b.tokens ?? 0).toLocaleString()}</td>
                                      <td className="pr-2 py-0.5">{(b.thinkMs / 1000).toFixed(1)}s</td>
                                      <td className="pr-2 py-0.5">{fmtMs(b.solveMs)}</td>
                                      <td className="py-0.5">+{b.xp}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          no runs yet. make Jev cook to collect run stats ⏱️
                        </p>
                      )}
                    </SafeBoundary>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="audit" className="mt-0 flex-1 lg:min-h-0 lg:overflow-y-auto">
                <Card className="border-2">
                  <CardHeader className="pb-2 pt-3">
                    <CardTitle className="font-heading text-xl">📜 ROTATION AUDIT</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {audit.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        nothing has moved yet. every turn that rotates the cube —
                        yours, Jev&apos;s judged moves, its tool&apos;s — lands here.
                      </p>
                    ) : (
                      <>
                        <div className="mb-2 flex flex-wrap gap-1.5 text-[10px] font-mono text-muted-foreground">
                          <Badge variant="secondary" className="font-mono">
                            🌪️ {audit.filter((x) => x.by === "scramble").length} scramble
                          </Badge>
                          <Badge variant="secondary" className="font-mono">
                            🧠 {audit.filter((x) => x.by === "jev").length} judged by Jev
                          </Badge>
                          <Badge variant="secondary" className="font-mono">
                            ⚡ {audit.filter((x) => x.by === "tool").length} by its tool
                          </Badge>
                        </div>
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1">
                          {(audit.length > 300 ? audit.slice(-300) : audit).map((e) => (
                            <span
                              key={e.i}
                              title={`turn ${e.i} — ${e.by === "scramble" ? "player scramble" : e.by === "jev" ? "judged by Jev" : "superhuman tool Jev invoked"}`}
                              className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${
                                e.by === "tool"
                                  ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                                  : e.by === "jev"
                                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                                    : "border-border bg-card text-muted-foreground"
                              }`}
                            >
                              {e.i} {e.by === "tool" ? "⚡" : e.by === "jev" ? "🧠" : "🌪️"} {e.move}
                            </span>
                          ))}
                        </div>
                        {audit.length > 300 && (
                          <p className="mt-2 text-[10px] text-muted-foreground">
                            showing the last 300 of {audit.length} turns
                          </p>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="about" className="mt-0 flex-1 lg:min-h-0 lg:overflow-y-auto">
                <Card className="border-2">
                  <CardHeader className="pb-2 pt-3">
                    <CardTitle className="font-heading text-xl">🧠 Meet Jev, your cube&apos;s AI solver</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                    <div className="space-y-1">
                      <h3 className="font-semibold text-foreground">Who&apos;s Jev?</h3>
                      <p>
                        Jev is rubikjev&apos;s resident AI solver persona. You wreck the cube — Jev
                        reads the chaos, rates it, roasts it, then calmly cooks the solve while you
                        watch.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-semibold text-foreground">What happens in a run</h3>
                      <p>
                        Jev reads only the live cube state — the 54-sticker facelet
                        string and a progress summary, never your move history, never
                        anything personal — and judges the solve one move at a time:
                        the 18-move alphabet is declared once, then every turn Jev
                        sees the fresh state and picks exactly one move. Nothing
                        else ever rotates the cube: if the engine is down, nothing
                        streams; if Jev can&apos;t finish, the run ends failed and it
                        owns the miss (the one exception: the superhuman tool,
                        only when Jev itself invokes it — tagged ⚡ in the feed).
                        You get a verdict (one of five meme tiers, a 1–5 star
                        rating, exactly one roast) and every move streams turn by
                        turn — the 📜 Audit tab keeps the full rotation log (🌪️
                        yours, 🧠 Jev&apos;s, ⚡ its tool&apos;s). Every run meters
                        the tokens it burned.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-semibold text-foreground">Reading the tiers</h3>
                      <p>
                        🗿 GIGACHAD SCRAMBLE · 👨‍🍳 CERTIFIED COOKER · 😐 CERTIFIED MID · 🤖 NPC
                        ENERGY · 🌿 GO TOUCH GRASS. Stars scale with how brutal the undo is.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-semibold text-foreground">The gamble</h3>
                      <p>
                        After every solve, bank the XP or feed Jev&apos;s slot machine — double,
                        triple, ×5, ×10… or nothing. House edge slightly favors Jev. Obviously.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-semibold text-foreground">The fine print</h3>
                      <p>
                        Judgments come from a third-party AI model and are probabilistic — for fun,
                        not facts. Runs are rate-limited (12 per minute per visitor). The heavy
                        lifting happens server-side; your browser only receives curated game
                        events, never raw inference.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Verdict — pinned right under the human input */}
            {meta ? (
              <Card className="border-2 border-fuchsia-500/40 bg-fuchsia-500/5 animate-in fade-in zoom-in-95 duration-300">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-heading text-2xl ${TIERS[meta.tier].color}`}>
                      {meta.tierEmoji} {meta.tierLabel}
                    </span>
                    <span className="text-amber-400">{"⭐".repeat(meta.stars)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    &ldquo;{meta.roast}&rdquo; — Jev, probably
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge variant="secondary">
                      {gamble
                        ? `${gamble.base} XP in the pot 🎰`
                        : phase === "solved"
                          ? `+${meta.xp} XP banked`
                          : `+${meta.xp} XP on the line`}
                    </Badge>
                    {meta.tools > 0 && <Badge variant="secondary">{meta.tools} tool calls 🧰</Badge>}
                    <Badge variant="secondary" className="border-emerald-400/40 bg-emerald-400/10 font-bold text-emerald-300">
                      🧠 {(meta.thinkMs / 1000).toFixed(1)}s of pure Jev thinking
                    </Badge>
                    {meta.superhuman && <Badge variant="secondary">superhuman finish ⚡</Badge>}
                    {meta.chaos && <Badge variant="secondary">certified chaos 🌪️</Badge>}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>

        {/* Feed — full-width bottom row */}
        <Card className="lg:h-36 lg:min-h-[120px] flex-none">
          <CardHeader className="pb-1 pt-2.5">
            <CardTitle className="font-heading text-lg">💬 Jev live feed</CardTitle>
          </CardHeader>
          <CardContent className="lg:h-[calc(100%-2.4rem)] overflow-y-auto">
            {feed.length === 0 ? (
              <p className="text-sm text-muted-foreground">silence. the cube awaits its fate 🕯️</p>
            ) : (
              <ul className="space-y-1">
                {feed.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-1.5 text-xs animate-in fade-in slide-in-from-top-1"
                    title={f.text}
                  >
                    <span className="text-emerald-400">›</span>
                    <span className="truncate">{f.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <LegalChrome />
      </div>
    </div>
  );
}
