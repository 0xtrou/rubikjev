// Verifies what actually ships: the cubie model (move tables, orientation
// legality), the facelet payload, and the Kociemba solver behind the ⚡ tool —
// every solution cross-checked against the independent reference model.
// Run: pnpm check
import { applyMove, applyMoves, isSolved, solvedCube } from "../src/lib/cubie.ts";
import { solveKociembaFacelets, expandHalfTurns, referenceFacelets, referenceSolvesFacelets } from "../src/lib/solve-kociemba.ts";
import { randomScramble } from "../src/lib/cube.ts";

let fails = 0;
const fail = (msg) => { fails++; console.error("FAIL:", msg); };

// --- move-table sanity: every face quarter/half turn has order dividing 4 ---
for (const f of ["U", "D", "L", "R", "F", "B"]) {
  for (const m of [f, f + "'", f + "2"]) {
    let s = solvedCube();
    for (let i = 0; i < 4; i++) s = applyMove(s, m);
    if (!isSolved(s)) fail(`${m}^4 is not identity`);
  }
}

// --- model sanity: orientation sums stay in the legal solvable space ---
for (let trial = 0; trial < 100; trial++) {
  const h = randomScramble(1 + Math.floor(Math.random() * 60));
  const s = applyMoves(solvedCube(), h);
  const coSum = s.co.reduce((a, b) => a + b, 0) % 3;
  const eoSum = s.eo.reduce((a, b) => a + b, 0) % 2;
  if (coSum !== 0 || eoSum !== 0) fail(`trial ${trial}: orientation sums co=${coSum} eo=${eoSum}`);
}

// --- facelet payload: 54 stickers, 9 per face ---
const facelets = referenceFacelets(randomScramble(40));
if (!facelets || facelets.length !== 54 || ![...facelets].every((ch) => facelets.split(ch).length - 1 === 9)) {
  fail(`facelet payload malformed: ${facelets}`);
}

// --- Kociemba (the ⚡ tool): randomized + monsters, reference cross-checked ---
const t0 = Date.now();
await solveKociembaFacelets(referenceFacelets(["R", "U", "R'", "U'"]) ?? "");
console.log(`kociemba table init: ${Date.now() - t0}ms`);
const kmStats = [];
for (let trial = 0; trial < 30; trial++) {
  const h = randomScramble(1 + Math.floor(Math.random() * 80));
  const start = referenceFacelets(h);
  let solution;
  try {
    solution = await solveKociembaFacelets(start ?? "");
  } catch (e) {
    fail(`kociemba threw (history ${h.length}): ${e.message}`);
    continue;
  }
  if (!referenceSolvesFacelets(start ?? "", solution)) fail(`kociemba solution does not solve reference (history ${h.length})`);
  kmStats.push(solution.length);
}
{
  const h = randomScramble(3000);
  const start = referenceFacelets(h);
  const solution = await solveKociembaFacelets(start ?? "");
  if (!referenceSolvesFacelets(start ?? "", solution)) fail("kociemba monster scramble unsolved");
  kmStats.push(solution.length);
}

const stat = (a) => a.length ? `min ${Math.min(...a)} / avg ${Math.round(a.reduce((x, y) => x + y) / a.length)} / max ${Math.max(...a)}` : "none";

// --- ⚡ humanize: half-turn expansion keeps the solve and adds variety ---
const expLens = [];
for (let trial = 0; trial < 20; trial++) {
  const h = randomScramble(20);
  const start = referenceFacelets(h) ?? "";
  const sol = await solveKociembaFacelets(start);
  const expanded = expandHalfTurns(sol);
  if (!referenceSolvesFacelets(start, expanded)) fail(`expanded tail does not solve (trial ${trial})`);
  if (!expanded.every((m) => /^[UDLRFB]['2]?$/.test(m))) fail(`expanded move outside alphabet (trial ${trial})`);
  if (expanded.length < sol.length) fail(`expansion shrank the tail (trial ${trial})`);
  expLens.push(expanded.length);
}
console.log(`expanded ⚡ tails: ${expLens.length} checked — moves ${stat(expLens)}`);
if (new Set(expLens).size < 3) fail(`expanded tails show no variety: ${expLens.join(",")}`);

console.log(`Kociemba solutions: ${kmStats.length} checked — moves ${stat(kmStats)}`);
console.log(fails === 0 ? "ALL SOLVER CHECKS PASS" : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
