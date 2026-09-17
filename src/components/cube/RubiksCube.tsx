"use client";

import { useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import {
  AXIS_OF,
  MATERIAL_FACES,
  gutterMaterial,
  stickerTexture,
} from "./textures";
import type { Move } from "@/lib/cube";

export type CubeSpeed = "fast" | "slow";

export type CubeApi = {
  enqueue: (moves: Move[], speed?: CubeSpeed) => void;
  isBusy: () => boolean;
  onSettled: (cb: (() => void) | null) => void;
  celebrate: () => void;
  /** zero the animated-turn counter (call when starting a new solve) */
  resetTurns: () => void;
  /** fires with the 1-based index of each turn as it starts animating */
  onTurn: (cb: ((i: number) => void) | null) => void;
};

type Props = { ref?: React.Ref<CubeApi>; resetKey?: number };

const SPACING = 1.04;
const CUBIE = 0.98;
const DURATIONS = { fast: 0.11, slow: 0.24 };

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// One cubie: a box with 6 materials; only outward faces get sticker textures.
function Cubie({ position }: { position: [number, number, number] }) {
  const materials = useMemo(() => {
    const dark = gutterMaterial();
    return MATERIAL_FACES.map((face, i) => {
      const axisIdx = Math.floor(i / 2); // 0=x, 1=y, 2=z into the [x,y,z] tuple
      const sign = i % 2 === 0 ? 1 : -1;
      const outward = position[axisIdx] === sign;
      return outward ? new THREE.MeshStandardMaterial({ map: stickerTexture(face), roughness: 0.4 }) : dark;
    });
  }, [position]);

  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  return (
    <mesh position={position} material={materials}>
      <boxGeometry args={[CUBIE, CUBIE, CUBIE]} />
    </mesh>
  );
}

type Anim = {
  pivot: THREE.Group;
  cubies: THREE.Object3D[];
  axis: "x" | "y" | "z";
  target: number;
  elapsed: number;
  duration: number;
};

export default function RubiksCube({ ref, resetKey = 0 }: Props) {
  const rootRef = useRef<THREE.Group>(null);
  const queue = useRef<{ move: Move; speed: CubeSpeed }[]>([]);
  const anim = useRef<Anim | null>(null);
  const settledCb = useRef<(() => void) | null>(null);
  const victory = useRef<{ t: number; dur: number } | null>(null);
  const turnCb = useRef<((i: number) => void) | null>(null);
  const turnCounter = useRef(0);

  const cubies = useMemo(() => {
    const list: [number, number, number][] = [];
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++)
          if (x !== 0 || y !== 0 || z !== 0) list.push([x, y, z]);
    return list;
  }, []);

  useImperativeHandle(ref, () => ({
    enqueue: (moves, speed = "slow") => {
      moves.forEach((move) => queue.current.push({ move, speed }));
    },
    isBusy: () => anim.current !== null || queue.current.length > 0,
    onSettled: (cb) => {
      settledCb.current = cb;
    },
    celebrate: () => {
      victory.current = { t: 0, dur: 1.5 };
    },
    resetTurns: () => {
      turnCounter.current = 0;
    },
    onTurn: (cb) => {
      turnCb.current = cb;
    },
  }));

  const startMove = (move: Move, speed: CubeSpeed) => {
    const root = rootRef.current;
    if (!root) return;
    const spec = AXIS_OF[move[0]];
    const turns = move.endsWith("'") ? 3 : move.endsWith("2") ? 2 : 1;
    // Clockwise viewed from the face = negative rotation around that axis.
    const angle = spec.dir * (Math.PI / 2) * turns;
    // Adaptive pacing: as the solve backlog grows (monster scrambles), spin
    // faster so the full solve stays watchable instead of taking minutes.
    const factor = Math.max(0.15, 1 - queue.current.length / 60);
    const pivot = new THREE.Group();
    root.add(pivot);
    // Copy first: attach() re-parents children while we iterate.
    const candidates = root.children.filter((child) => (child as THREE.Mesh).isMesh);
    const selected: THREE.Object3D[] = [];
    candidates.forEach((child) => {
      const coord = child.position[spec.axis] / SPACING;
      if (Math.round(coord) === spec.layer) selected.push(child);
    });
    selected.forEach((c) => pivot.attach(c));
    // The counter tracks the cube, not the network: fires as each turn starts.
    turnCounter.current += 1;
    turnCb.current?.(turnCounter.current);
    anim.current = {
      pivot,
      cubies: selected,
      axis: spec.axis,
      target: angle,
      elapsed: 0,
      duration: DURATIONS[speed] * factor,
    };
  };

  const finalize = () => {
    const a = anim.current;
    const root = rootRef.current;
    if (!a || !root) return;
    a.pivot.rotation[a.axis] = a.target;
    a.pivot.updateMatrixWorld(true);
    [...a.cubies].forEach((c) => {
      root.attach(c);
      c.position.set(
        Math.round(c.position.x / SPACING) * SPACING,
        Math.round(c.position.y / SPACING) * SPACING,
        Math.round(c.position.z / SPACING) * SPACING
      );
      // Snap orientation to the nearest 90° multiple.
      const m = new THREE.Matrix4().makeRotationFromQuaternion(c.quaternion);
      const e = m.elements;
      for (let i = 0; i < 16; i++) e[i] = Math.round(e[i]);
      c.quaternion.setFromRotationMatrix(m);
      c.updateMatrix();
    });
    root.remove(a.pivot);
    anim.current = null;
  };

  useFrame((_, delta) => {
    // Victory lap: full 360° spin with a scale pulse.
    const v = victory.current;
    if (v && rootRef.current) {
      v.t += delta;
      const p = Math.min(1, v.t / v.dur);
      const ease = 1 - Math.pow(1 - p, 3);
      rootRef.current.rotation.y = ease * Math.PI * 2;
      rootRef.current.scale.setScalar(1 + 0.15 * Math.sin(Math.PI * p));
      if (p >= 1) {
        victory.current = null;
        rootRef.current.rotation.y = 0;
        rootRef.current.scale.setScalar(1);
      }
    }

    const a = anim.current;
    if (a) {
      a.elapsed += delta;
      const t = Math.min(1, a.elapsed / a.duration);
      a.pivot.rotation[a.axis] = a.target * easeInOut(t);
      if (t >= 1) finalize();
    } else if (queue.current.length > 0) {
      const { move, speed } = queue.current.shift()!;
      startMove(move, speed);
    } else if (settledCb.current && !victory.current) {
      const cb = settledCb.current;
      settledCb.current = null;
      cb();
    }
  });

  return (
    <group key={resetKey} ref={rootRef} dispose={null}>
      {cubies.map((p) => (
        <Cubie key={`${p[0]},${p[1]},${p[2]}`} position={p} />
      ))}
    </group>
  );
}
