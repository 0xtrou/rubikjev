import * as THREE from "three";

// Sticker textures adapted from buuing/Rubiks-Cube (github.com/buuing/Rubiks-Cube):
// each face texture is a dark "gutter" with a rounded-rect sticker drawn on
// canvas, which gives cubies the classic beveled sticker look for free.

export const FACE_COLORS = {
  U: "#f4f4f5", // white
  D: "#facc15", // yellow
  F: "#22c55e", // green
  B: "#3b82f6", // blue
  R: "#ef4444", // red
  L: "#f97316", // orange
} as const;

export type FaceKey = keyof typeof FACE_COLORS;

const GUTTER = "#101014";
const TEX_SIZE = 160;

const cache = new Map<string, THREE.Texture>();

export function stickerTexture(face: FaceKey): THREE.Texture {
  const hit = cache.get(face);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TEX_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = GUTTER;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  // rounded sticker
  const inset = 14;
  const radius = 34;
  ctx.fillStyle = FACE_COLORS[face];
  ctx.beginPath();
  ctx.roundRect(inset, inset, TEX_SIZE - inset * 2, TEX_SIZE - inset * 2, radius);
  ctx.fill();
  // subtle top gloss
  const grad = ctx.createLinearGradient(0, 0, 0, TEX_SIZE);
  grad.addColorStop(0, "rgba(255,255,255,0.18)");
  grad.addColorStop(0.4, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(face, tex);
  return tex;
}

export function gutterMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: GUTTER, roughness: 0.85 });
}

// BoxGeometry material order: [+x, -x, +y, -y, +z, -z]
// mapped to faces:      R    L    U    D    F    B
export const MATERIAL_FACES: FaceKey[] = ["R", "L", "U", "D", "F", "B"];

export const AXIS_OF: Record<string, { axis: "x" | "y" | "z"; layer: number; dir: 1 | -1 }> = {
  R: { axis: "x", layer: 1, dir: -1 },
  L: { axis: "x", layer: -1, dir: 1 },
  U: { axis: "y", layer: 1, dir: -1 },
  D: { axis: "y", layer: -1, dir: 1 },
  F: { axis: "z", layer: 1, dir: -1 },
  B: { axis: "z", layer: -1, dir: 1 },
};
