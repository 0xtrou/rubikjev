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

/** Near-optimal (~≤22 move) solution for the cube produced by `history`. */
export async function solveKociemba(history: Move[]): Promise<Move[]> {
  await ensureSolver();
  const scrambled = new Cube().move(history.join(" "));
  const solution = scrambled.solve();
  return solution ? (solution.split(" ") as Move[]) : [];
}

/** Ground truth: does history followed by solution solve the reference model? */
export function referenceSolves(history: Move[], solution: Move[]): boolean {
  try {
    const c = new Cube().move(history.join(" ")).move(solution.join(" "));
    return c.isSolved();
  } catch {
    return false;
  }
}

/** Canonical 54-sticker facelet string of the scrambled cube (URFDLB order). */
export function referenceFacelets(history: Move[]): string | null {
  try {
    return new Cube().move(history.join(" ")).asString();
  } catch {
    return null;
  }
}
