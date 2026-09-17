// Headless check of the exact cube math used in RubiksCube.tsx:
// layer selection, pivot rotation, attach-back, and the 90° snapping.
// Run: node scripts/cube-math-check.mjs
import * as THREE from "three";

const SPACING = 1.04;

const AXIS_OF = {
  R: { axis: "x", layer: 1, dir: -1 },
  L: { axis: "x", layer: -1, dir: 1 },
  U: { axis: "y", layer: 1, dir: -1 },
  D: { axis: "y", layer: -1, dir: 1 },
  F: { axis: "z", layer: 1, dir: -1 },
  B: { axis: "z", layer: -1, dir: 1 },
};

const root = new THREE.Group();
const cubies = [];
for (let x = -1; x <= 1; x++)
  for (let y = -1; y <= 1; y++)
    for (let z = -1; z <= 1; z++) {
      if (x === 0 && y === 0 && z === 0) continue;
      const m = new THREE.Mesh();
      m.position.set(x * SPACING, y * SPACING, z * SPACING);
      root.add(m);
      cubies.push(m);
    }

function applyMove(move) {
  const spec = AXIS_OF[move[0]];
  const turns = move.endsWith("'") ? 3 : move.endsWith("2") ? 2 : 1;
  const angle = (spec.dir * Math.PI * turns) / 2;
  const pivot = new THREE.Group();
  root.add(pivot);
  // same fix as the component: copy before re-parenting
  const candidates = root.children.filter((c) => c.isMesh);
  const selected = candidates.filter(
    (c) => Math.round(c.position[spec.axis] / SPACING) === spec.layer
  );
  if (selected.length !== 9) throw new Error(`layer ${move}: picked ${selected.length}, want 9`);
  selected.forEach((c) => pivot.attach(c));
  pivot.rotation[spec.axis] = angle; // jump straight to the end state
  pivot.updateMatrixWorld(true);
  [...selected].forEach((c) => {
    root.attach(c);
    c.position.set(
      Math.round(c.position.x / SPACING) * SPACING,
      Math.round(c.position.y / SPACING) * SPACING,
      Math.round(c.position.z / SPACING) * SPACING
    );
    const m = new THREE.Matrix4().makeRotationFromQuaternion(c.quaternion);
    for (let i = 0; i < 16; i++) m.elements[i] = Math.round(m.elements[i]);
    c.quaternion.setFromRotationMatrix(m);
  });
  root.remove(pivot);
}

const key = (m) =>
  m.position.toArray().map((v) => Math.round(v / SPACING)).join(",") +
  "|" +
  m.quaternion.toArray().map((v) => Math.round(v * 2) / 2).join(",");

// Ported from src/lib/cube.ts
function invertHistory(history) {
  return [...history]
    .reverse()
    .map((m) => (m.endsWith("'") ? m[0] : m.endsWith("2") ? m : m + "'"));
}
function simplify(seq) {
  let out = [...seq], changed = true;
  const qt = (m) => (m.endsWith("'") ? 3 : m.endsWith("2") ? 2 : 1);
  const from = (f, q) => { const n = ((q % 4) + 4) % 4; return n === 0 ? null : n === 1 ? f : n === 2 ? f + "2" : f + "'"; };
  while (changed) {
    changed = false;
    const next = [];
    for (const m of out) {
      const last = next[next.length - 1];
      if (last && last[0] === m[0]) { const merged = from(m[0], qt(last) + qt(m)); next.pop(); if (merged) next.push(merged); changed = true; }
      else next.push(m);
    }
    out = next;
  }
  return out;
}

let fails = 0;
for (let trial = 0; trial < 200; trial++) {
  const faces = ["U", "D", "L", "R", "F", "B"];
  const mods = ["", "'", "2"];
  const n = 3 + Math.floor(Math.random() * 30);
  const scramble = [];
  let prev = "";
  while (scramble.length < n) {
    const f = faces[Math.floor(Math.random() * 6)];
    if (f === prev) continue;
    scramble.push(f + mods[Math.floor(Math.random() * 3)]);
    prev = f;
  }
  const solution = simplify(invertHistory(scramble));

  const before = new Map(cubies.map((c) => [c.uuid, key(c)]));
  [...scramble, ...solution].forEach(applyMove);
  for (const c of cubies) {
    if (key(c) !== before.get(c.uuid)) {
      fails++;
      console.error(`trial ${trial}: cubie drifted after scramble(${scramble.join(" ")}) + solve(${solution.join(" ")})`);
      break;
    }
  }
}
console.log(fails === 0 ? "ALL 200 TRIALS PASS — scramble+solution returns every cubie home" : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
