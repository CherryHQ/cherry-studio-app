import type { ImageContent } from '@earendil-works/pi-ai';

import { estimatePiImageTokens, readImageDimensions } from '../piImageTokens';

describe('Pi image token estimate', () => {
  test.each([
    ['PNG', png(1000, 750)],
    ['JPEG behind an EXIF block', jpeg(1000, 750, 4096)],
    ['GIF', gif(1000, 750)],
    ['lossy WebP', webpVp8(1000, 750)],
    ['lossless WebP', webpVp8l(1000, 750)],
    ['extended WebP', webpVp8x(1000, 750)],
  ])('reads the dimensions of a %s header', (_, bytes) => {
    expect(readImageDimensions(base64(bytes))).toEqual({ width: 1000, height: 750 });
  });

  test('gives up on unknown or truncated data', () => {
    expect(readImageDimensions('AAAA')).toBeUndefined();
    expect(readImageDimensions(base64(png(1000, 750).subarray(0, 20)))).toBeUndefined();
    expect(readImageDimensions('not base64!')).toBeUndefined();
  });

  test('applies each dialect formula to measured dimensions', () => {
    const square = image(png(1000, 1000));

    // ceil(1000·1000 / 750)
    expect(estimatePiImageTokens('anthropic-messages', square)).toBe(1334);
    // Short side to 768 → 2×2 tiles → 85 + 170·4
    expect(estimatePiImageTokens('openai-responses', square)).toBe(765);
    expect(estimatePiImageTokens('openai-completions', square)).toBe(765);
    // Crop unit floor(1000 / 1.5) = 666 → 2×2 crops
    expect(estimatePiImageTokens('google-generative-ai', square)).toBe(1032);
    expect(estimatePiImageTokens('google-generative-ai', image(png(300, 300)))).toBe(258);
  });

  test('clamps a large photo to the provider budget before pricing it', () => {
    const photo = image(jpeg(4000, 3000, 0));

    // Longest edge 1568, then at most 1.15 MP.
    expect(estimatePiImageTokens('anthropic-messages', photo)).toBe(1534);
    // 2048 box, short side 768 → 1024×768 → 2×2 tiles.
    expect(estimatePiImageTokens('openai-responses', photo)).toBe(765);
  });

  test('falls back to the dialect constant when dimensions are unknown', () => {
    const unknown: ImageContent = { type: 'image', mimeType: 'image/png', data: 'AAAA' };

    expect(estimatePiImageTokens('anthropic-messages', unknown)).toBe(1590);
    expect(estimatePiImageTokens('azure-openai-responses', unknown)).toBe(765);
    expect(estimatePiImageTokens('google-vertex', unknown)).toBe(258);
  });
});

function image(bytes: Uint8Array): ImageContent {
  return { type: 'image', mimeType: 'image/png', data: base64(bytes) };
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** SOI, an APP1 segment of `exifBytes`, then a baseline SOF0 frame header. */
function jpeg(width: number, height: number, exifBytes: number): Uint8Array {
  const app1 = exifBytes > 0 ? 4 + exifBytes : 0;
  const bytes = new Uint8Array(2 + app1 + 19);
  const view = new DataView(bytes.buffer);
  bytes.set([0xff, 0xd8]);
  let offset = 2;
  if (exifBytes > 0) {
    bytes.set([0xff, 0xe1], offset);
    view.setUint16(offset + 2, exifBytes + 2);
    offset += app1;
  }
  bytes.set([0xff, 0xc0], offset);
  view.setUint16(offset + 2, 17);
  bytes[offset + 4] = 8;
  view.setUint16(offset + 5, height);
  view.setUint16(offset + 7, width);
  return bytes;
}

function gif(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(13);
  bytes.set([...'GIF89a'].map((character) => character.charCodeAt(0)));
  const view = new DataView(bytes.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return bytes;
}

function webp(chunk: string, payload: (bytes: Uint8Array, view: DataView) => void): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.set([...`RIFF\0\0\0\0WEBP${chunk}`].map((character) => character.charCodeAt(0)));
  payload(bytes, new DataView(bytes.buffer));
  return bytes;
}

function webpVp8(width: number, height: number): Uint8Array {
  return webp('VP8 ', (bytes, view) => {
    bytes.set([0x9d, 0x01, 0x2a], 23);
    view.setUint16(26, width, true);
    view.setUint16(28, height, true);
  });
}

function webpVp8l(width: number, height: number): Uint8Array {
  return webp('VP8L', (bytes, view) => {
    bytes[20] = 0x2f;
    view.setUint32(21, (width - 1) | ((height - 1) << 14), true);
  });
}

function webpVp8x(width: number, height: number): Uint8Array {
  return webp('VP8X', (_, view) => {
    view.setUint16(24, (width - 1) & 0xffff, true);
    view.setUint8(26, (width - 1) >> 16);
    view.setUint16(27, (height - 1) & 0xffff, true);
    view.setUint8(29, (height - 1) >> 16);
  });
}
