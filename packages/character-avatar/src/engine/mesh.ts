import type { CharacterPose } from './motion';
import type { CharacterRig, Point } from './types';

export type CharacterMesh = {
  /** Rest positions; also the texture coordinates, since every layer shares one canvas. */
  rest: Point[];
  indices: number[];
  heights: number[];
  swayWeights: number[][];
};

const GRID = 12;
const TRAIL = 0.9;
/** Sway influence radius as a share of the frame side. */
const SWAY_SIGMA = 0.165;

/** A grid over the canvas; precomputed weights keep the per-frame worklet arithmetic-only. */
export function createCharacterMesh(rig: CharacterRig): CharacterMesh {
  const { size, neck, sways, frame } = rig;
  const rest: Point[] = [];
  for (let row = 0; row <= GRID; row++) {
    for (let col = 0; col <= GRID; col++) {
      rest.push({ x: (col / GRID) * size, y: (row / GRID) * size });
    }
  }
  const indices: number[] = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const i = row * (GRID + 1) + col;
      indices.push(i, i + 1, i + GRID + 1, i + 1, i + GRID + 2, i + GRID + 1);
    }
  }
  const top = frame.center.y - frame.side / 2;
  const heights = rest.map(
    ({ y }) => Math.max(0, Math.min(1, (neck.y - y) / Math.max(1, neck.y - top))) ** 1.4,
  );
  const sigma = frame.side * SWAY_SIGMA;
  const swayWeights = sways.map((sway) =>
    rest.map(({ x, y }) => Math.exp(-((x - sway.x) ** 2 + (y - sway.y) ** 2) / (2 * sigma ** 2))),
  );
  return { rest, indices, heights, swayWeights };
}

function rotateAround(p: Point, c: Point, degrees: number): Point {
  'worklet';
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/**
 * Secondary motion only: the group transform applies the pose itself, while the mesh lets the top
 * of the head trail behind it (`lag` = recent pose minus current, in canvas pixels) and hair
 * masses swing around a root between them and the frame centre.
 */
export function deformPoint(
  p: Point,
  height: number,
  swayWeights: number[],
  lag: CharacterPose,
  pose: CharacterPose,
  rig: CharacterRig,
): Point {
  'worklet';
  const { neck, sways, frame } = rig;
  let q = { x: p.x + lag.x * height * TRAIL, y: p.y + lag.y * height * TRAIL };
  q = rotateAround(q, neck, lag.rotate * height * TRAIL);
  for (let i = 0; i < sways.length; i++) {
    const weight = swayWeights[i] ?? 0;
    if (weight < 0.02) continue;
    const sway = sways[i]!;
    const root = {
      x: sway.x + (frame.center.x - sway.x) * 0.55,
      y: sway.y + (frame.center.y - sway.y) * 0.55,
    };
    const outward = sway.x < frame.center.x ? -1 : 1;
    q = rotateAround(q, root, pose.sway * outward * weight);
  }
  return q;
}

export function deformMesh(
  mesh: CharacterMesh,
  lag: CharacterPose,
  pose: CharacterPose,
  rig: CharacterRig,
): Point[] {
  'worklet';
  const out: Point[] = new Array(mesh.rest.length);
  for (let i = 0; i < mesh.rest.length; i++) {
    const weights: number[] = [];
    for (let s = 0; s < mesh.swayWeights.length; s++) weights.push(mesh.swayWeights[s]![i]!);
    out[i] = deformPoint(mesh.rest[i]!, mesh.heights[i]!, weights, lag, pose, rig);
  }
  return out;
}
