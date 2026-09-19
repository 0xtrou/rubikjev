// Jev's toolbox — the "tools" half of the agent loop. Each function is a
// piece-scoped executor: it takes the real cube state, returns the moves for
// ONE human-style objective (a cross, one corner, one middle edge, one last-
// layer job), and touches nothing it wasn't asked to touch. Jev picks the
// tools and the order; this code only guarantees every step is legal.
// Nothing here ever looks at the scramble history — the solve is paved from
// the state alone.
import { applyMoves, edgeTransitions, rotateY, type CubieState } from "./cubie";
import type { Move } from "./cube";

export type CrossStyle = "SWIFT" | "GRIND";

const ALL_MOVES: Move[] = [];
for (const f of ["U", "D", "L", "R", "F", "B"]) ALL_MOVES.push(f, f + "'", f + "2");
const QUARTER_MOVES: Move[] = ["U", "U'", "D", "D'", "L", "L'", "R", "R'", "F", "F'", "B", "B'"];

const U4 = (k: number): Move[] => {
  const n = ((k % 4) + 4) % 4;
  return n === 0 ? [] : n === 1 ? ["U"] : n === 2 ? ["U2"] : ["U'"];
};

const cornerAt = (s: CubieState, cubie: number) => s.cp.indexOf(cubie);
const edgeAt = (s: CubieState, cubie: number) => s.ep.indexOf(cubie);
const cornerSolved = (s: CubieState, slot: number) => s.cp[slot] === slot && s.co[slot] === 0;
const edgeSolved = (s: CubieState, slot: number) => s.ep[slot] === slot && s.eo[slot] === 0;

const asAlg = (x: Move | Move[]): Move[] => (Array.isArray(x) ? x : [x]);

// ---------------------------------------------------------------------------
// Tool: build the bottom cross (D edges 4..7)
// ---------------------------------------------------------------------------

// Joint BFS over the four named D edges' (position, flip) — 24^4 states, so a
// visited bitmap over 20-bit keys covers the whole space. SWIFT searches all
// 18 moves (cross ≤ 8); GRIND grinds on quarter turns only, which reads more
// human and runs a few moves longer.
export function buildCross(s: CubieState, style: CrossStyle): Move[] {
  const T = edgeTransitions();
  const allowed = style === "SWIFT" ? ALL_MOVES : QUARTER_MOVES;
  const loc = (cubie: number) => {
    const p = edgeAt(s, cubie);
    return (p << 1) | s.eo[p];
  };
  const startVals = [4, 5, 6, 7].map(loc);
  const keyOf = (v: number[]) => v[0] | (v[1] << 5) | (v[2] << 10) | (v[3] << 15);
  const startKey = keyOf(startVals);
  const goal = (v: number[]) => v.every((x, i) => x === (4 + i) << 1);
  if (goal(startVals)) return [];

  const prev = new Int32Array(1 << 20).fill(-1);
  const prevMove = new Int8Array(1 << 20);
  let frontier = [startKey];
  prev[startKey] = startKey;
  const valsOf = (key: number) => [(key & 31), ((key >> 5) & 31), ((key >> 10) & 31), ((key >> 15) & 31)];

  let depth = 0;
  while (frontier.length && depth <= 14) {
    const next: number[] = [];
    for (const key of frontier) {
      const v = valsOf(key);
      if (goal(v)) {
        const path: Move[] = [];
        let k = key;
        while (k !== startKey) {
          path.push(allowed[prevMove[k]]);
          k = prev[k];
        }
        return path.reverse();
      }
      for (let mi = 0; mi < allowed.length; mi++) {
        const t = T[allowed[mi]];
        const nv = v.map((x) => (t.to[x >> 1] << 1) | (t.flip[x >> 1] ^ (x & 1)));
        const nk = keyOf(nv);
        if (prev[nk] === -1) {
          prev[nk] = key;
          prevMove[nk] = mi;
          next.push(nk);
        }
      }
    }
    frontier = next;
    depth++;
  }
  throw new Error("cross search exhausted");
}

// ---------------------------------------------------------------------------
// Tool: seat ONE bottom corner (slot 4..7, radius 0..3)
// ---------------------------------------------------------------------------

const sexy = (r: number): Move[] => ["R", "U", "R'", "U'"].map((m) => rotateY(m, r));

export function seatCorner(s: CubieState, r: number): Move[] {
  const slot = 4 + r;
  if (cornerSolved(s, slot)) return [];
  const out: Move[] = [];
  let cur = s;
  const do_ = (ms: Move[]) => { out.push(...ms); cur = applyMoves(cur, ms); };

  for (let guard = 0; guard < 10; guard++) {
    if (cornerSolved(cur, slot)) return out;
    const pos = cornerAt(cur, slot);
    if (pos >= 4) {
      // Intruder in a bottom slot — pop it out with that slot's sexy.
      do_(sexy(pos - 4));
      continue;
    }
    // Somewhere in the top layer: rotate U until it sits above its slot…
    do_(U4(((r - pos + 4) % 4)));
    // …then repeat the slot's sexy until it drops in (≤ 6).
    for (let i = 0; i < 7; i++) {
      if (cornerSolved(cur, slot)) break;
      do_(sexy(r));
    }
  }
  if (!cornerSolved(cur, slot)) throw new Error(`corner slot ${slot} refused to solve`);
  return out;
}

// ---------------------------------------------------------------------------
// Tool: thread ONE middle edge (slot 8..11, radius 0..3)
// ---------------------------------------------------------------------------

const INSERT_RIGHT = ["U", "R", "U'", "R'", "U'", "F'", "U", "F"];
const INSERT_LEFT = ["U'", "L'", "U", "L", "U", "F", "U'", "F'"];
const insertAlg = (r: number, left: boolean) =>
  (left ? INSERT_LEFT : INSERT_RIGHT).map((m) => rotateY(m, r));

export function threadEdge(s: CubieState, r: number): Move[] {
  const slot = 8 + r;
  if (edgeSolved(s, slot)) return [];
  const out: Move[] = [];
  let cur = s;
  const do_ = (ms: Move[]) => { out.push(...ms); cur = applyMoves(cur, ms); };

  for (let attempt = 0; attempt < 6; attempt++) {
    if (edgeSolved(cur, slot)) return out;
    const pos = edgeAt(cur, slot);
    if (pos >= 8) {
      // Stuck in a middle slot (wrong or flipped): eject it.
      do_(insertAlg(pos - 8, false));
      continue;
    }
    // In the top layer: try every U alignment and insert direction, keep
    // whichever actually lands the edge (exactly one does — the edge's flip
    // is U-invariant, so it must be approached from the face its side
    // sticker is on: the right-insert of slot r, or the left-insert
    // relabeled from the neighboring face).
    let done = false;
    for (let k = 0; k < 4 && !done; k++) {
      for (const cand of [
        [...U4(k), ...insertAlg(r, false)],
        [...U4(k), ...insertAlg((r + 3) % 4, true)],
      ]) {
        if (edgeSolved(applyMoves(cur, cand), slot)) { do_(cand); done = true; break; }
      }
    }
    if (!done) throw new Error(`middle slot ${slot} unreachable`);
  }
  if (!edgeSolved(cur, slot)) throw new Error(`middle slot ${slot} refused to solve`);
  return out;
}

// ---------------------------------------------------------------------------
// Last-layer tools
// ---------------------------------------------------------------------------

const EDGE_CYCLE = ["R", "U'", "R", "U", "R", "U", "R", "U'", "R'", "U'", "R2"];
const CORNER_CYCLE = ["U", "R", "U'", "L'", "U", "R'", "U'", "L"]; // edge-safe

// Effect of an LL macro on the four U-layer pieces (top edges 0..3 or top
// corners 0..3): a 4-slot permutation plus per-slot orientation delta.
function macroEffect(moves: Move[], kind: "edges" | "corners") {
  const solved = { cp: [0, 1, 2, 3, 4, 5, 6, 7], co: [0, 0, 0, 0, 0, 0, 0, 0], ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
  const res = applyMoves(solved, moves);
  const perm = [0, 1, 2, 3].map((i) => (kind === "edges" ? res.ep[i] : res.cp[i]));
  const add = [0, 1, 2, 3].map((i) => (kind === "edges" ? res.eo[i] : res.co[i]));
  if (perm.some((p) => p > 3)) throw new Error("macro breaks the bottom layers");
  return { moves, perm, add };
}

function bfs4(
  start: { ids: number[]; ori: number[] },
  goal: (ids: number[], ori: number[]) => boolean,
  macros: ReturnType<typeof macroEffect>[],
  mod: number,
  maxDepth = 10,
): Move[] {
  const key = (ids: number[], ori: number[]) => ids.join(",") + "|" + ori.join(",");
  const startKey = key(start.ids, start.ori);
  let frontier = [{ ids: start.ids, ori: start.ori, path: [] as Move[] }];
  const visited = new Set([startKey]);
  for (let depth = 0; depth <= maxDepth; depth++) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      if (goal(node.ids, node.ori)) return node.path;
      for (const m of macros) {
        const ids = [0, 1, 2, 3].map((i) => node.ids[m.perm[i]]);
        const ori = [0, 1, 2, 3].map((i) => (node.ori[m.perm[i]] + m.add[i]) % mod);
        const k = key(ids, ori);
        if (visited.has(k)) continue;
        visited.add(k);
        next.push({ ids, ori, path: [...node.path, ...m.moves] });
      }
    }
    frontier = next;
  }
  throw new Error("last-layer search exhausted");
}

/** Tool: orient the four top edges (make the U cross). */
export function orientTopEdges(s: CubieState): Move[] {
  if ([0, 1, 2, 3].every((i) => s.eo[i] === 0)) return [];
  const macros = ["U", "U'", "U2", ["F", "R", "U", "R'", "U'", "F'"]].map((m) =>
    macroEffect(asAlg(m), "edges")
  );
  return bfs4(
    { ids: [0, 1, 2, 3].map((i) => s.ep[i]), ori: [0, 1, 2, 3].map((i) => s.eo[i]) },
    (_ids, ori) => ori.every((x) => x === 0),
    macros, 2,
  );
}

/** Tool: permute the four top edges (match the side centers). */
export function permuteTopEdges(s: CubieState): Move[] {
  if ([0, 1, 2, 3].every((i) => s.ep[i] === i && s.eo[i] === 0)) return [];
  const macros = ["U", "U'", "U2", EDGE_CYCLE].map((m) => macroEffect(asAlg(m), "edges"));
  return bfs4(
    { ids: [0, 1, 2, 3].map((i) => s.ep[i]), ori: [0, 1, 2, 3].map((i) => s.eo[i]) },
    (ids, ori) => ids.every((x, i) => x === i) && ori.every((x) => x === 0),
    macros, 2,
  );
}

/**
 * Tool: finish the top corners — position AND orient them, while bringing the
 * top edges back into alignment if the U turns drifted them. Joint BFS over
 * (corner ids, corner twists, edge ids) with {U, U', U2, NIKLAS}: NIKLAS is
 * edge-safe, so the edge component only rotates under the U macros and the
 * goal can demand everything ordered at once.
 */
export function finishTopCorners(s: CubieState): Move[] {
  const done =
    [0, 1, 2, 3].every((i) => s.cp[i] === i && s.co[i] === 0) &&
    [0, 1, 2, 3].every((i) => s.ep[i] === i);
  if (done) return [];

  const cornerMacros = ["U", "U'", "U2", CORNER_CYCLE].map((m) => macroEffect(asAlg(m), "corners"));
  const edgeMacros = ["U", "U'", "U2", CORNER_CYCLE].map((m) => macroEffect(asAlg(m), "edges"));

  type Node = { cids: number[]; cori: number[]; eids: number[]; path: Move[] };
  const key = (n: { cids: number[]; cori: number[]; eids: number[] }) =>
    n.cids.join(",") + "|" + n.cori.join(",") + "|" + n.eids.join(",");
  const goal = (n: { cids: number[]; cori: number[]; eids: number[] }) =>
    n.cids.every((x, i) => x === i) && n.cori.every((x) => x === 0) && n.eids.every((x, i) => x === i);

  const start: Node = {
    cids: [0, 1, 2, 3].map((i) => s.cp[i]),
    cori: [0, 1, 2, 3].map((i) => s.co[i]),
    eids: [0, 1, 2, 3].map((i) => s.ep[i]),
    path: [],
  };
  if (goal(start)) return [];

  let frontier = [start];
  const visited = new Set([key(start)]);
  for (let depth = 0; depth <= 14; depth++) {
    const next: Node[] = [];
    for (const node of frontier) {
      if (goal(node)) return node.path;
      cornerMacros.forEach((m, mi) => {
        const cids = [0, 1, 2, 3].map((i) => node.cids[m.perm[i]]);
        const cori = [0, 1, 2, 3].map((i) => (node.cori[m.perm[i]] + m.add[i]) % 3);
        const em = edgeMacros[mi];
        const eids = [0, 1, 2, 3].map((i) => node.eids[em.perm[i]]);
        const nNode: Node = { cids, cori, eids, path: [...node.path, ...m.moves] };
        if (!visited.has(key(nNode))) {
          visited.add(key(nNode));
          next.push(nNode);
        }
      });
    }
    frontier = next;
  }
  throw new Error("corner finish search exhausted");
}
