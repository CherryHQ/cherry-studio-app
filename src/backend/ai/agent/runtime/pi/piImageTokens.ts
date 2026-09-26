/**
 * Vision-image token cost per request dialect. With pixel dimensions (read
 * from the encoded header, never by decoding the bitmap) the provider's
 * documented formula applies; otherwise a documented-typical constant does.
 *
 * The formula is keyed on the endpoint protocol, which cannot distinguish
 * model versions; per-version tweaks are second-order for an estimate that
 * only decides when to compact.
 */

import { convertBase64ToUint8Array } from '@ai-sdk/provider-utils';
import type { ImageContent, Api as PiApi } from '@earendil-works/pi-ai';

type ImageDimensions = { width: number; height: number };
type ImageTokenDialect = 'anthropic' | 'google' | 'openai';

/** Enough encoded bytes to reach a JPEG frame header behind a large EXIF block. */
const HEADER_BASE64_CHARACTERS = 256 * 1024;

const dimensionsByImage = new WeakMap<ImageContent, ImageDimensions | null>();

export function estimatePiImageTokens(api: PiApi, image: ImageContent): number {
  let dimensions = dimensionsByImage.get(image);
  if (dimensions === undefined) {
    dimensions = readImageDimensions(image.data) ?? null;
    dimensionsByImage.set(image, dimensions);
  }
  const dialect = imageTokenDialect(api);
  if (dialect === 'anthropic') return anthropicImageTokens(dimensions);
  if (dialect === 'google') return geminiImageTokens(dimensions);
  return openaiImageTokens(dimensions);
}

function imageTokenDialect(api: PiApi): ImageTokenDialect {
  if (api === 'anthropic-messages') return 'anthropic';
  if (api === 'google-generative-ai' || api === 'google-vertex') return 'google';
  return 'openai';
}

/** Anthropic: `ceil(w·h / 750)` after clamping the longest edge to 1568px and 1.15 MP. */
function anthropicImageTokens(dimensions: ImageDimensions | null): number {
  if (!dimensions) return 1590;
  const { width, height } = clampToBudget(dimensions, 1568, 1_150_000);
  return Math.ceil((width * height) / 750);
}

/** OpenAI high detail: `85 + 170·tiles`, 512px tiles after fitting 2048² then a 768px short side. */
function openaiImageTokens(dimensions: ImageDimensions | null): number {
  if (!dimensions) return 765;
  const { width, height } = fitOpenAi(dimensions);
  return 85 + 170 * Math.ceil(width / 512) * Math.ceil(height / 512);
}

/** Gemini: 258 when both sides fit 384px, else 258 per crop of `floor(min side / 1.5)`. */
function geminiImageTokens(dimensions: ImageDimensions | null): number {
  if (!dimensions) return 258;
  const { width, height } = dimensions;
  if (width <= 384 && height <= 384) return 258;
  const crop = Math.max(1, Math.floor(Math.min(width, height) / 1.5));
  return 258 * Math.max(1, Math.ceil(width / crop)) * Math.max(1, Math.ceil(height / crop));
}

function clampToBudget(
  dimensions: ImageDimensions,
  maxEdge: number,
  maxPixels: number,
): ImageDimensions {
  let { width, height } = dimensions;
  const longest = Math.max(width, height);
  if (longest > maxEdge) {
    width *= maxEdge / longest;
    height *= maxEdge / longest;
  }
  if (width * height > maxPixels) {
    const scale = Math.sqrt(maxPixels / (width * height));
    width *= scale;
    height *= scale;
  }
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

function fitOpenAi(dimensions: ImageDimensions): ImageDimensions {
  let { width, height } = dimensions;
  const longest = Math.max(width, height);
  if (longest > 2048) {
    width *= 2048 / longest;
    height *= 2048 / longest;
  }
  const shortest = Math.min(width, height);
  if (shortest > 768) {
    width *= 768 / shortest;
    height *= 768 / shortest;
  }
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

/** PNG, JPEG, GIF, and WebP header dimensions; undefined when unreadable. */
export function readImageDimensions(base64: string): ImageDimensions | undefined {
  let bytes: Uint8Array;
  try {
    const length =
      base64.length > HEADER_BASE64_CHARACTERS ? HEADER_BASE64_CHARACTERS : base64.length;
    bytes = convertBase64ToUint8Array(base64.slice(0, length - (length % 4)));
  } catch {
    return undefined;
  }
  const dimensions =
    readPngDimensions(bytes) ??
    readJpegDimensions(bytes) ??
    readGifDimensions(bytes) ??
    readWebpDimensions(bytes);
  return dimensions && dimensions.width > 0 && dimensions.height > 0 ? dimensions : undefined;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readPngDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  if (bytes.length < 24 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
    return undefined;
  }
  return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) };
}

function readJpegDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return undefined;
    const marker = bytes[offset + 1]!;
    // Fill bytes and standalone markers carry no length.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    // Start-of-frame markers, excluding DHT (C4), JPG (C8), and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: readUint16BE(bytes, offset + 5), width: readUint16BE(bytes, offset + 7) };
    }
    if (marker === 0xda) return undefined;
    offset += 2 + readUint16BE(bytes, offset + 2);
  }
  return undefined;
}

function readGifDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  if (bytes.length < 10 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'GIF8') {
    return undefined;
  }
  return { width: bytes[6]! | (bytes[7]! << 8), height: bytes[8]! | (bytes[9]! << 8) };
}

function readWebpDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  if (
    bytes.length < 30 ||
    String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF' ||
    String.fromCharCode(...bytes.subarray(8, 12)) !== 'WEBP'
  ) {
    return undefined;
  }
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunk === 'VP8 ') {
    return {
      width: (bytes[26]! | (bytes[27]! << 8)) & 0x3fff,
      height: (bytes[28]! | (bytes[29]! << 8)) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    const bits = bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    return {
      width: 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)),
      height: 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)),
    };
  }
  return undefined;
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) >>> 0) +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  );
}
