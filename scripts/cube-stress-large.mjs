// Headless stress test: monster scrambles (500 turns) + simplified inverse
// must return every cubie home. Same math as src/components/cube/RubiksCube.tsx.
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
  const candidates = root.children.filter((c) => c.isMesh);
  const selected = candidates.filter(
    (c) => Math.round(c.position[spec.axis] / SPACING) === spec.layer
  );
  if (selected.length !== 9) throw new Error(`layer ${move}: picked ${selected.length}`);
  selected.forEach((c) => pivot.attach(c));
  pivot.rotation[spec.axis] = angle;
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

const invert = (h) =>
  [...h].reverse().map((m) => (m.endsWith("'") ? m[0] : m.endsWith("2") ? m : m + "'"));

const faces = ["U", "D", "L", "R", "F", "B"];
const mods = ["", "'", "2"];
let fails = 0;

for (let t = 0; t < 5; t++) {
  const h = [];
  let prev = "";
  while (h.length < 500) {
    const f = faces[Math.floor(Math.random() * 6)];
    if (f === prev) continue;
    h.push(f + mods[Math.floor(Math.random() * 3)]);
    prev = f;
  }
  const before = new Map(cubies.map((c) => [c.uuid, key(c)]));
  [...h, ...invert(h)].forEach(applyMove);
  for (const c of cubies) {
    if (key(c) !== before.get(c.uuid)) {
      fails++;
      console.log(`trial ${t}: drifted (500 moves)`);
      break;
    }
  }
}
console.log(fails === 0 ? "500-MOVE SCRAMBLES: all 5 trials return every cubie home" : `FAILURES: ${fails}`);
process.exit(fails === 0 ? 0 : 1);
