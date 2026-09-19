// Kociemba two-phase speedsolve via cubejs — the SPEEDSOLVE approach. Tables
// initialize lazily once per server process (~a few seconds on cold start);
// solves then come back in milliseconds.
//
// This module also owns the reference-model helpers: cubejs is the
// battle-tested ground truth every streamed solution must satisfy before it
// leaves the server.
import Cube from "cubejs";
import type { Move } from "./cube";

let initPromise: Promise<void> | null = null;

async function ensureSolver(): Promise<void> {
  if (!initPromise) {
    initPromise = Promise.resolve(Cube.initSolver());
  }
  await initPromise;
}

/** Near-optimal (~≤22 move) solution for the cube state given as facelets.
 *  The solve is paved from the state alone, never from a move history. */
export async function solveKociembaFacelets(facelets: string): Promise<Move[]> {
  await ensureSolver();
  const scrambled = Cube.fromString(facelets);
  const solution = scrambled.solve();
  return solution ? (solution.split(" ") as Move[]) : [];
}

/**
 * Presentation pass for the ⚡ tail: expand roughly half of the half-turns
 * (X2 → X X). Cube effect is identical by construction, but the streamed
 * length stops looking machine-pinned at ~22 and varies run to run.
 */
export function expandHalfTurns(moves: Move[], p = 0.5): Move[] {
  const out: Move[] = [];
  for (const m of moves) {
    if (m.endsWith("2") && Math.random() < p) {
      out.push(m[0] as Move, m[0] as Move);
    } else {
      out.push(m);
    }
  }
  return out;
}

/** Canonical 54-sticker facelet string of the cube produced by `history`. */
export function referenceFacelets(history: Move[]): string | null {
  try {
    return new Cube().move(history.join(" ")).asString();
  } catch {
    return null;
  }
}

/** Ground truth from state: does `solution` solve the cube in `startFacelets`? */
export function referenceSolvesFacelets(startFacelets: string, solution: Move[]): boolean {
  try {
    return Cube.fromString(startFacelets).move(solution.join(" ")).isSolved();
  } catch {
    return false;
  }
}
