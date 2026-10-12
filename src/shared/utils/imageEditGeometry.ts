import type { ImageEditInput } from '@/shared/contracts/fileImageEdit';

type Point = { x: number; y: number };
type Matrix = [number, number, number, number, number, number, number, number, number];

function multiply(a: Matrix, b: Matrix): Matrix {
  return a.map((_, index) => {
    const row = Math.floor(index / 3);
    const column = index % 3;
    return a[row * 3] * b[column] + a[row * 3 + 1] * b[column + 3] + a[row * 3 + 2] * b[column + 6];
  }) as Matrix;
}

export function mapImagePoint(matrix: readonly number[], { x, y }: Point): Point {
  const denominator = matrix[6] * x + matrix[7] * y + matrix[8];
  return {
    x: (matrix[0] * x + matrix[1] * y + matrix[2]) / denominator,
    y: (matrix[3] * x + matrix[4] * y + matrix[5]) / denominator,
  };
}

/** One pixel-space homography drives both the editor preview and the persisted derivative. */
export function imageEditGeometry(edit: ImageEditInput, source: { width: number; height: number }) {
  const radians = ((edit.rotation + (edit.straighten ?? 0)) * Math.PI) / 180;
  // Exact quarter turns must not grow the output by a rounding pixel.
  const cosine = Math.round(Math.cos(radians) * 1e12) / 1e12;
  const sine = Math.round(Math.sin(radians) * 1e12) / 1e12;
  const rotatedWidth = Math.abs(cosine) * source.width + Math.abs(sine) * source.height;
  const rotatedHeight = Math.abs(sine) * source.width + Math.abs(cosine) * source.height;
  const horizontal = ((edit.horizontal ?? 0) / 45) * 0.35;
  const vertical = ((edit.vertical ?? 0) / 45) * 0.35;
  const rotation: Matrix = [cosine, -sine, 0, sine, cosine, 0, 0, 0, 1];
  const center: Matrix = [1, 0, -source.width / 2, 0, 1, -source.height / 2, 0, 0, 1];
  const mirror: Matrix = [
    edit.flipHorizontal ? -1 : 1,
    0,
    0,
    0,
    edit.flipVertical ? -1 : 1,
    0,
    0,
    0,
    1,
  ];
  const perspective: Matrix = [
    1,
    0,
    0,
    0,
    1,
    0,
    (2 * horizontal) / rotatedWidth,
    (2 * vertical) / rotatedHeight,
    1,
  ];
  const centeredMatrix = multiply(perspective, multiply(mirror, multiply(rotation, center)));
  const corners = [
    { x: 0, y: 0 },
    { x: source.width, y: 0 },
    { x: source.width, y: source.height },
    { x: 0, y: source.height },
  ].map((point) => mapImagePoint(centeredMatrix, point));
  const left = Math.min(...corners.map((point) => point.x));
  const top = Math.min(...corners.map((point) => point.y));
  const rawWidth = Math.max(...corners.map((point) => point.x)) - left;
  const rawHeight = Math.max(...corners.map((point) => point.y)) - top;
  const width = Math.ceil(rawWidth);
  const height = Math.ceil(rawHeight);
  const matrix = multiply([1, 0, -left, 0, 1, -top, 0, 0, 1], centeredMatrix);
  // Fit a centered rectangle inside every half-plane of the transformed quadrilateral.
  // The crop cannot expose transparent wedges after rotation or perspective correction.
  const centerX = corners.reduce((sum, point) => sum + point.x, 0) / 4;
  const centerY = corners.reduce((sum, point) => sum + point.y, 0) / 4;
  let scale = 1;
  for (let index = 0; index < 4; index++) {
    const a = corners[index];
    const b = corners[(index + 1) % 4];
    const nx = b.y - a.y;
    const ny = a.x - b.x;
    const distance = Math.abs(nx * (centerX - a.x) + ny * (centerY - a.y));
    scale = Math.min(
      scale,
      distance / ((Math.abs(nx) * rawWidth) / 2 + (Math.abs(ny) * rawHeight) / 2),
    );
  }
  // A tiny inset absorbs floating-point error at slanted boundaries, without cropping identity.
  if (edit.straighten || edit.horizontal || edit.vertical) scale *= 1 - 1e-9;
  const bounds = {
    x: Math.max(0, (centerX - left - (rawWidth * scale) / 2) / width),
    y: Math.max(0, (centerY - top - (rawHeight * scale) / 2) / height),
    width: (rawWidth * scale) / width,
    height: (rawHeight * scale) / height,
  };
  return { matrix, width, height, bounds };
}
