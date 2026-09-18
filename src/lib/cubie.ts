// Cubie-level cube model (permutation + orientation), used to compute the
// real cube state from a scramble history so a genuine solver — not the
// history inverse — can produce the solution. Convention follows the classic
// Kociemba cubie coordinates: state.cp[i] is the corner cubie sitting at
// corner position i (co its twist), state.ep[i] / eo likewise for edges.
//
// Corner positions: 0=URF 1=UFL 2=ULB 3=UBR 4=DFR 5=DLF 6=DBL 7=DRB
// Edge positions:   0=UR 1=UF 2=UL 3=UB 4=DR 5=DF 6=DL 7=DB 8=FR 9=FL 10=BL 11=BR
import type { Move } from "./cube";

export type CubieState = {
  cp: number[];
  co: number[];
  ep: number[];
  eo: number[];
};

const IDENTITY_CP = [0, 1, 2, 3, 4, 5, 6, 7];
const IDENTITY_EP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const ZEROS8 = [0, 0, 0, 0, 0, 0, 0, 0];
const ZEROS12 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

// One face quarter turn each, clockwise. Verified against a reference cube
// library by scripts/solver-check.mjs — do not edit by hand without rerunning it.
const QUARTER: Record<string, { cp: number[]; co: number[]; ep: number[]; eo: number[] }> = {
  U: {
    cp: [3, 0, 1, 2, 4, 5, 6, 7], co: ZEROS8,
    ep: [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11], eo: ZEROS12,
  },
  D: {
    cp: [0, 1, 2, 3, 5, 6, 7, 4], co: ZEROS8,
    ep: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11], eo: ZEROS12,
  },
  R: {
    cp: [4, 1, 2, 0, 7, 5, 6, 3], co: [2, 0, 0, 1, 1, 0, 0, 2],
    ep: [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0], eo: ZEROS12,
  },
  L: {
    cp: [0, 2, 6, 3, 4, 1, 5, 7], co: [0, 1, 2, 0, 0, 2, 1, 0],
    ep: [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11], eo: ZEROS12,
  },
  F: {
    cp: [1, 5, 2, 3, 0, 4, 6, 7], co: [1, 2, 0, 0, 2, 1, 0, 0],
    ep: [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11], eo: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0],
  },
  B: {
    cp: [0, 1, 3, 7, 4, 5, 2, 6], co: [0, 0, 1, 2, 0, 0, 2, 1],
    ep: [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7], eo: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1],
  },
};

function compose(a: { cp: number[]; co: number[]; ep: number[]; eo: number[] },
  b: { cp: number[]; co: number[]; ep: number[]; eo: number[] }) {
  return {
    cp: a.cp.map((_, i) => a.cp[b.cp[i]]),
    co: a.co.map((_, i) => (a.co[b.cp[i]] + b.co[i]) % 3),
    ep: a.ep.map((_, i) => a.ep[b.ep[i]]),
    eo: a.eo.map((_, i) => (a.eo[b.ep[i]] + b.eo[i]) % 2),
  };
}

// All 18 moves, precomposed.
const MOVES: Record<string, { cp: number[]; co: number[]; ep: number[]; eo: number[] }> = {};
for (const face of ["U", "D", "L", "R", "F", "B"]) {
  const q = QUARTER[face];
  MOVES[face] = q;
  MOVES[face + "2"] = compose(q, q);
  MOVES[face + "'"] = compose(compose(q, q), q);
}

export function solvedCube(): CubieState {
  return { cp: [...IDENTITY_CP], co: [...ZEROS8], ep: [...IDENTITY_EP], eo: [...ZEROS12] };
}

export function applyMove(s: CubieState, m: Move): CubieState {
  const t = MOVES[m];
  if (!t) throw new Error(`unknown move: ${m}`);
  return {
    cp: t.cp.map((p, i) => s.cp[p]),
    co: t.co.map((o, i) => (s.co[t.cp[i]] + o) % 3),
    ep: t.ep.map((p, i) => s.ep[p]),
    eo: t.eo.map((o, i) => (s.eo[t.ep[i]] + o) % 2),
  };
}

export function applyMoves(s: CubieState, moves: Move[]): CubieState {
  let out = s;
  for (const m of moves) out = applyMove(out, m);
  return out;
}

export function isSolved(s: CubieState): boolean {
  return (
    s.cp.every((c, i) => c === i && s.co[i] === 0) &&
    s.ep.every((e, i) => e === i && s.eo[i] === 0)
  );
}

// Whole-cube rotation around the U axis by r quarter turns (faces travel the
// way U sends them: F→L→B→R). Used to retarget one slot's routine to the
// three other equivalent slots.
const Y_STEP: Record<string, string> = { F: "L", L: "B", B: "R", R: "F", U: "U", D: "D" };
export function rotateY(m: Move, r: number): Move {
  let face = m[0];
  for (let i = 0; i < ((r % 4) + 4) % 4; i++) face = Y_STEP[face];
  return face + m.slice(1);
}

// Per-move transition tables for the abstract (piece-level) solvers: for a
// cubie currently at position q, to[q] is where the move sends it and the
// flip/twist delta applies once it arrives there.
export function edgeTransitions(): Record<string, { to: number[]; flip: number[] }> {
  const out: Record<string, { to: number[]; flip: number[] }> = {};
  for (const [m, t] of Object.entries(MOVES)) {
    const to = new Array(12).fill(0);
    const flip = new Array(12).fill(0);
    for (let p = 0; p < 12; p++) {
      to[t.ep[p]] = p;
      flip[t.ep[p]] = t.eo[p];
    }
    out[m] = { to, flip };
  }
  return out;
}
