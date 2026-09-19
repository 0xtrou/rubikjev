// Cube move engine — shared by client and server.
// A scramble is a sequence of face turns applied to a solved cube; the exact
// solution is its inverse. We simplify the inverse so the AI solve looks less
// like a dumb rewind (consecutive same-face turns collapse into one).

export type Modifier = "" | "'" | "2";
export type Move = string; // e.g. "R", "R'", "U2"

export const FACES = ["U", "D", "L", "R", "F", "B"] as const;
export type Face = (typeof FACES)[number];

const MOVE_RE = /^[UDLRFB]['2]?$/;

export function isValidMove(m: unknown): m is Move {
  return typeof m === "string" && MOVE_RE.test(m);
}

export function parseHistory(input: unknown): Move[] {
  if (!Array.isArray(input)) throw new Error("history must be an array of moves");
  if (input.length > 5000) throw new Error("history too long (max 5000 moves)");
  return input.map((m) => {
    if (!isValidMove(m)) throw new Error(`invalid move: ${JSON.stringify(m)}`);
    return m as Move;
  });
}

function flip(m: Move): Move {
  if (m.endsWith("'")) return m[0];
  if (m.endsWith("2")) return m;
  return m + "'";
}

/** Exact solution for a scramble: reverse the history and invert each turn. */
function invertHistory(history: Move[]): Move[] {
  return [...history].reverse().map(flip);
}

function quarterTurns(m: Move): number {
  if (m.endsWith("'")) return 3;
  if (m.endsWith("2")) return 2;
  return 1;
}

function fromQuarterTurns(face: string, q: number): Move | null {
  const n = ((q % 4) + 4) % 4;
  if (n === 0) return null;
  if (n === 1) return face;
  if (n === 2) return face + "2";
  return face + "'";
}

/**
 * Collapse consecutive turns of the same face (R R -> R2, R R' -> nothing).
 * Runs until the sequence stops shrinking.
 */
export function simplify(seq: Move[]): Move[] {
  let out = [...seq];
  let changed = true;
  while (changed) {
    changed = false;
    const next: Move[] = [];
    for (const m of out) {
      const last = next[next.length - 1];
      if (last && last[0] === m[0]) {
        const merged = fromQuarterTurns(m[0], quarterTurns(last) + quarterTurns(m));
        next.pop();
        if (merged) next.push(merged);
        changed = true;
      } else {
        next.push(m);
      }
    }
    out = next;
  }
  return out;
}

/** The solution Jev will stream back for a given scramble history. */
export function solveFor(history: Move[]): Move[] {
  return simplify(invertHistory(history));
}

const rand = (n: number) => Math.floor(Math.random() * n);

/** Random scramble with standard quality rules (no trivial same-face repeats). */
export function randomScramble(length: number): Move[] {
  const seq: Move[] = [];
  let prevFace = "";
  let prevPrevFace = "";
  const mods: Modifier[] = ["", "'", "2"];
  while (seq.length < length) {
    const face = FACES[rand(FACES.length)];
    const sameAxis = (a: string, b: string) =>
      a !== b && "UD".includes(a) === "UD".includes(b) && "LR".includes(a) === "LR".includes(b);
    const axisPair = ["U", "D"].includes(prevFace) && ["U", "D"].includes(face);
    if (face === prevFace) continue;
    if (sameAxis(face, prevFace) && face === prevPrevFace) continue;
    if (axisPair && prevPrevFace === prevFace) continue;
    seq.push(face + mods[rand(3)]);
    prevPrevFace = prevFace;
    prevFace = face;
  }
  return seq;
}

/** Rough human-facing stats used for XP math and state prep. */
export function scrambleStats(history: Move[]) {
  const faceCounts: Record<string, number> = {};
  for (const m of history) faceCounts[m[0]] = (faceCounts[m[0]] ?? 0) + 1;
  const simplified = simplify(history);
  return {
    length: history.length,
    simplifiedLength: simplified.length,
    cancellations: history.length - simplified.length,
    faceCounts,
  };
}
