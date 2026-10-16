/**
 * Pixel operations on unpremultiplied RGBA buffers. Pure and synchronous, so codecs (Skia) stay at
 * the edges and every operation is testable with hand-made pixels.
 */
export type RgbaImage = { width: number; height: number; data: Uint8Array };
export type PixelBounds = { left: number; top: number; right: number; bottom: number };
/** A rectangle in fractions of the image size. */
export type RelativeRegion = { x: number; y: number; width: number; height: number };

const OPAQUE_ALPHA = 24;

export function opaqueBounds(image: RgbaImage): PixelBounds | null {
  const { width, height, data } = image;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! < OPAQUE_ALPHA) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return right < 0 ? null : { left, top, right, bottom };
}

function regionBounds(image: RgbaImage, region?: RelativeRegion): PixelBounds {
  if (!region) return { left: 0, top: 0, right: image.width - 1, bottom: image.height - 1 };
  const clamp = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(value)));
  return {
    left: clamp(region.x * image.width, image.width - 1),
    top: clamp(region.y * image.height, image.height - 1),
    right: clamp((region.x + region.width) * image.width, image.width - 1),
    bottom: clamp((region.y + region.height) * image.height, image.height - 1),
  };
}

/** Per-pixel colour and alpha distance between two images of the same size. */
function pixelDistance(a: Uint8Array, b: Uint8Array, i: number): number {
  return (
    Math.abs(a[i]! - b[i]!) +
    Math.abs(a[i + 1]! - b[i + 1]!) +
    Math.abs(a[i + 2]! - b[i + 2]!) +
    Math.abs(a[i + 3]! - b[i + 3]!)
  );
}

/** 255 where the images differ by more than `threshold` inside `region`, else 0. */
function differenceMask(
  a: RgbaImage,
  b: RgbaImage,
  threshold: number,
  region?: RelativeRegion,
): Uint8Array {
  const mask = new Uint8Array(a.width * a.height);
  const bounds = regionBounds(a, region);
  for (let y = bounds.top; y <= bounds.bottom; y++) {
    for (let x = bounds.left; x <= bounds.right; x++) {
      const p = y * a.width + x;
      if (pixelDistance(a.data, b.data, p * 4) > threshold) mask[p] = 255;
    }
  }
  return mask;
}

/** Separable square max filter: grows every marked area by `radius` pixels. */
function dilateMask(mask: Uint8Array, width: number, height: number, radius: number) {
  const pass = (source: Uint8Array, horizontal: boolean) => {
    const out = new Uint8Array(source.length);
    const lines = horizontal ? height : width;
    const length = horizontal ? width : height;
    for (let line = 0; line < lines; line++) {
      for (let i = 0; i < length; i++) {
        let max = 0;
        for (let k = Math.max(0, i - radius); k <= Math.min(length - 1, i + radius); k++) {
          const v = source[horizontal ? line * width + k : k * width + line]!;
          if (v > max) max = v;
          if (max === 255) break;
        }
        out[horizontal ? line * width + i : i * width + line] = max;
      }
    }
    return out;
  };
  return pass(pass(mask, true), false);
}

/** Three box-blur passes per axis: close to a Gaussian, linear in the radius. */
function blurMask(mask: Uint8Array, width: number, height: number, radius: number) {
  if (radius < 1) return mask;
  const pass = (source: Uint8Array, horizontal: boolean) => {
    const out = new Uint8Array(source.length);
    const lines = horizontal ? height : width;
    const length = horizontal ? width : height;
    const at = (line: number, i: number) =>
      source[horizontal ? line * width + i : i * width + line]!;
    for (let line = 0; line < lines; line++) {
      let sum = 0;
      for (let i = -radius; i <= radius; i++) sum += at(line, Math.max(0, Math.min(length - 1, i)));
      for (let i = 0; i < length; i++) {
        out[horizontal ? line * width + i : i * width + line] = Math.round(sum / (2 * radius + 1));
        sum += at(line, Math.min(length - 1, i + radius + 1)) - at(line, Math.max(0, i - radius));
      }
    }
    return out;
  };
  let out = mask;
  for (let n = 0; n < 3; n++) out = pass(pass(out, true), false);
  return out;
}

/** `top` over `base`, weighted per pixel by `mask` (0 keeps base, 255 takes top). */
function blendByMask(base: RgbaImage, top: RgbaImage, mask: Uint8Array): RgbaImage {
  const data = new Uint8Array(base.data.length);
  for (let p = 0; p < mask.length; p++) {
    const k = mask[p]! / 255;
    for (let c = 0; c < 4; c++) {
      const i = p * 4 + c;
      data[i] = Math.round(base.data[i]! * (1 - k) + top.data[i]! * k);
    }
  }
  return { width: base.width, height: base.height, data };
}

/**
 * Keeps `base` everywhere except where `variant` differs from it inside `region`: those areas,
 * grown and feathered, come from `variant`. Used to carry an edited face back onto a base whose
 * other details an image model redrew.
 */
export function transplantChanges(
  base: RgbaImage,
  variant: RgbaImage,
  options: { threshold: number; region?: RelativeRegion },
): { image: RgbaImage; changedRatio: number; changedBounds: PixelBounds | null } {
  const { width, height } = base;
  const raw = differenceMask(base, variant, options.threshold, options.region);
  const summary = summarize(raw, width, height);
  if (!summary.changedBounds) return { image: base, ...summary };
  // Grow and feather only around the changed area; the rest of the canvas keeps `base`.
  const scale = Math.max(1, Math.round(width / 1024));
  const grow = 15 * scale;
  const feather = 6 * scale;
  const reach = grow + feather * 3 + 1;
  const { left, top, right, bottom } = summary.changedBounds;
  const x0 = Math.max(0, left - reach);
  const y0 = Math.max(0, top - reach);
  const w = Math.min(width - 1, right + reach) - x0 + 1;
  const h = Math.min(height - 1, bottom + reach) - y0 + 1;
  const local = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    local.set(raw.subarray((y0 + y) * width + x0, (y0 + y) * width + x0 + w), y * w);
  const softened = blurMask(dilateMask(local, w, h, grow), w, h, feather);
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < h; y++) mask.set(softened.subarray(y * w, y * w + w), (y0 + y) * width + x0);
  return { image: blendByMask(base, variant, mask), ...summary };
}

function summarize(mask: Uint8Array, width: number, height: number) {
  let count = 0;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    count++;
    const x = p % width;
    const y = (p - x) / width;
    if (x < left) left = x;
    if (x > right) right = x;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
  return {
    changedRatio: count / mask.length,
    changedBounds: right < 0 ? null : { left, top, right, bottom },
  };
}

export function compareImages(
  a: RgbaImage,
  b: RgbaImage,
  options: { threshold: number; region?: RelativeRegion },
) {
  return summarize(differenceMask(a, b, options.threshold, options.region), a.width, a.height);
}

/**
 * Makes a flat background transparent: starting from the border, it floods every connected pixel
 * close to the border's dominant colour, so similar colours inside the subject stay opaque. Edge
 * pixels fade with their distance from the background colour.
 */
export function removeFlatBackground(image: RgbaImage, tolerance: number): RgbaImage {
  const { width, height } = image;
  const source = image.data;
  const border: number[] = [];
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) border.push(y * width, y * width + width - 1);
  const median = (channel: number) => {
    const values = border.map((p) => source[p * 4 + channel]!).sort((m, n) => m - n);
    return values[values.length >> 1]!;
  };
  const background = [median(0), median(1), median(2)];
  const distance = (p: number) =>
    Math.abs(source[p * 4]! - background[0]!) +
    Math.abs(source[p * 4 + 1]! - background[1]!) +
    Math.abs(source[p * 4 + 2]! - background[2]!);

  const flooded = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  for (const p of border) {
    if (!flooded[p] && distance(p) <= tolerance) {
      flooded[p] = 1;
      queue[tail++] = p;
    }
  }
  while (head < tail) {
    const p = queue[head++]!;
    const x = p % width;
    const neighbours = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width];
    for (const n of neighbours) {
      if (n < 0 || n >= flooded.length || flooded[n] || distance(n) > tolerance) continue;
      flooded[n] = 1;
      queue[tail++] = n;
    }
  }

  const data = new Uint8Array(source);
  const soft = Math.max(1, tolerance);
  for (let p = 0; p < flooded.length; p++) {
    if (flooded[p]) {
      data[p * 4 + 3] = 0;
      continue;
    }
    // Anti-aliased rim: a pixel touching the background keeps alpha in proportion to its contrast.
    const x = p % width;
    const touches =
      (x > 0 && flooded[p - 1]) ||
      (x < width - 1 && flooded[p + 1]) ||
      (p >= width && flooded[p - width]) ||
      (p + width < flooded.length && flooded[p + width]);
    if (touches) {
      const k = Math.min(1, (distance(p) - tolerance) / soft);
      data[p * 4 + 3] = Math.round(source[p * 4 + 3]! * Math.max(0, k));
    }
  }
  return { width, height, data };
}
