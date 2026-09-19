"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BadgeKey } from "@/lib/memes";

export type BenchEntry = {
  at: number; // epoch ms
  moves: number;
  stars: number;
  tokens: number;
  solveMs: number; // wall time from click to final move
  thinkMs: number; // real measured Jev judgment time (server-side)
  xp: number;
};

type GameStore = {
  xp: number;
  solves: number;
  bestScramble: number;
  badges: BadgeKey[];
  bench: BenchEntry[];
  addXp: (xp: number) => void;
  recordSolve: (scrambleLength: number) => void;
  awardBadge: (badge: BadgeKey) => void;
  addBench: (entry: BenchEntry) => void;
};

const num = (v: unknown, fallback = 0) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

// Older saved runs used different field sets (some lacked `tokens` entirely).
// Normalize everything on rehydration so rendering can never hit undefined.
function sanitizeBench(raw: unknown): BenchEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({
      at: num(e.at, Date.now()),
      moves: num(e.moves),
      stars: Math.min(5, Math.max(1, Math.round(num(e.stars, 3)))),
      tokens: num(e.tokens),
      solveMs: num(e.solveMs),
      thinkMs: num(e.thinkMs),
      xp: num(e.xp),
    }))
    .slice(0, 8);
}

export const useGame = create<GameStore>()(
  persist(
    (set) => ({
      xp: 0,
      solves: 0,
      bestScramble: 0,
      badges: [],
      bench: [],
      addXp: (xp) => set((s) => ({ xp: s.xp + xp })),
      recordSolve: (scrambleLength) =>
        set((s) => ({
          solves: s.solves + 1,
          bestScramble: Math.max(s.bestScramble, scrambleLength),
        })),
      awardBadge: (badge) =>
        set((s) => (s.badges.includes(badge) ? s : { badges: [...s.badges, badge] })),
      addBench: (entry) =>
        set((s) => ({ bench: [entry, ...s.bench].slice(0, 8) })),
    }),
    {
      name: "jev-cube-game",
      // Sanitize persisted state of any shape/version before it hits the app.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<GameStore>;
        return {
          ...current,
          ...p,
          xp: num(p.xp),
          solves: num(p.solves),
          bestScramble: num(p.bestScramble),
          badges: Array.isArray(p.badges) ? p.badges : [],
          bench: sanitizeBench(p.bench),
        };
      },
    }
  )
);
