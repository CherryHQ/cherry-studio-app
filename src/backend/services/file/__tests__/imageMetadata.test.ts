import { strToU8, zlibSync } from 'fflate';

import { AiContentLabelSchema, type AiContentLabel } from '@/shared/data/types/aiContent';

import { imageMetadata, type ImageMetadataSource } from '../imageMetadata';
import { readAiContentXmp, writeAiContentXmp } from '../xmpMetadata';

const label = AiContentLabelSchema.parse({
  Label: '1',
  ContentProducer: 'ProviderExample',
  ProduceID: 'content-1',
  ReservedCode1: '',
  ContentPropagator: 'RelayExample',
  PropagateID: 'relay-1',
  ReservedCode2: '',
});
const edited = { ...label, ProduceID: 'content-2', PropagateID: 'relay-2' };
const bytes = (...parts: Uint8Array[]) => new Uint8Array(Buffer.concat(parts));
const source = (data: Uint8Array): ImageMetadataSource => ({
  size: data.length,
  read: (offset, length) => data.slice(offset, offset + length),
});
const rewrite = (data: Uint8Array, mediaType: string, value: AiContentLabel | null = label) =>
  bytes(
    ...imageMetadata(source(data), mediaType, value).parts.map((part) =>
      part instanceof Uint8Array ? part : data.slice(part.offset, part.offset + part.length),
    ),
  );
const png = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBE8AAAAASUVORK5CYII=',
    'base64',
  ),
);

// Container fixtures retain opaque codec data. Pixel/Office visual fidelity requires native acceptance.
function chunk(type: string, payload: Uint8Array) {
  const result = Buffer.alloc(payload.length + 8 + (payload.length & 1));
  result.write(type, 0, 'ascii');
  result.writeUInt32LE(payload.length, 4);
  result.set(payload, 8);
  return new Uint8Array(result);
}
function webp(...chunks: Uint8Array[]) {
  const payload = bytes(strToU8('WEBP'), ...chunks);
  const header = Buffer.alloc(8);
  header.write('RIFF');
  header.writeUInt32LE(payload.length, 4);
  return bytes(header, payload);
}
const lossless = chunk('VP8L', new Uint8Array([0x2f, 0, 0, 0, 0x10, 0x91, 0x92]));
const gif = new Uint8Array(
  Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
);
const app0 = new Uint8Array([0xff, 0xe0, 0, 4, 0x4a, 0x46]);
const scan = new Uint8Array([0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 0x71, 0xff, 0, 0x72, 0xff, 0xd9]);
const jpeg = bytes(new Uint8Array([0xff, 0xd8]), app0, scan);

function pngChunks(data: Uint8Array) {
  const result: { type: string; bytes: Uint8Array }[] = [];
  for (let offset = 8; offset < data.length;) {
    const size = Buffer.from(data).readUInt32BE(offset);
    result.push({
      type: Buffer.from(data).toString('ascii', offset + 4, offset + 8),
      bytes: data.slice(offset, offset + size + 12),
    });
    offset += size + 12;
  }
  return result;
}

test.each([
  ['image/png', png],
  ['image/jpeg', jpeg],
  ['image/webp', webp(lossless)],
  ['image/gif', gif],
] as const)('round-trips and replaces a canonical label in %s', (mediaType, original) => {
  expect(imageMetadata(source(original), mediaType).label).toBeNull();
  const stored = rewrite(original, mediaType);
  expect(imageMetadata(source(stored), mediaType).label).toEqual(label);
  const updated = rewrite(stored, mediaType, edited);
  expect(imageMetadata(source(updated), mediaType).label).toEqual(edited);
  expect(Buffer.from(updated).toString()).not.toContain('content-1');
  const cleared = rewrite(updated, mediaType, null);
  expect(imageMetadata(source(cleared), mediaType).label).toBeNull();
  expect(rewrite(cleared, mediaType, null)).toEqual(cleared);
});

test('keeps every original PNG chunk, including compressed pixels', () => {
  const original = pngChunks(png);
  const stored = pngChunks(rewrite(png, 'image/png'));
  expect(stored.filter(({ type }) => type !== 'iTXt')).toEqual(original);
  expect(stored.filter(({ type }) => type === 'iTXt')).toHaveLength(1);
  const pixels = original.find(({ type }) => type === 'IDAT')!.bytes;
  expect(stored.find(({ type }) => type === 'IDAT')!.bytes).toEqual(pixels);
});

test('keeps JPEG headers in order and scan bytes untouched', () => {
  const stored = rewrite(jpeg, 'image/jpeg');
  expect(stored.slice(0, 2 + app0.length)).toEqual(jpeg.slice(0, 2 + app0.length));
  expect(stored.slice(-scan.length)).toEqual(scan);
});

test('adds VP8X dimensions/alpha and correct RIFF size without changing WebP codec data', () => {
  const stored = rewrite(webp(lossless), 'image/webp');
  expect(Buffer.from(stored).readUInt32LE(4) + 8).toBe(stored.length);
  expect(Buffer.from(stored).toString('ascii', 12, 16)).toBe('VP8X');
  expect(stored[20]).toBe(0x14);
  expect(Buffer.from(stored).includes(Buffer.from(lossless))).toBe(true);
  const extended = chunk('VP8X', new Uint8Array([0x12, 0, 0, 0, 3, 0, 0, 5, 0, 0]));
  const frames = chunk('ANMF', new Uint8Array([1, 2, 3, 4]));
  const animated = rewrite(webp(extended, chunk('ANIM', new Uint8Array(6)), frames), 'image/webp');
  expect(animated[20]).toBe(0x16);
  expect(animated.slice(21, 30)).toEqual(extended.slice(9, 18));
  expect(Buffer.from(animated).includes(Buffer.from(frames))).toBe(true);
});

test('retains GIF frames, delays and looping through the XMP application extension', () => {
  const loop = new Uint8Array([0x21, 0xff, 11, ...strToU8('NETSCAPE2.0'), 3, 1, 0, 0, 0]);
  const frames = gif.slice(19, -1);
  const original = bytes(gif.slice(0, 19), loop, frames, frames, new Uint8Array([0x3b]));
  const stored = rewrite(original, 'image/gif');
  expect(stored.slice(6, original.length - 1)).toEqual(original.slice(6, -1));
  expect(imageMetadata(source(stored), 'image/gif').label).toEqual(label);
});

test('reads compressed legacy PNG AIGC and normalizes it to one XMP property', () => {
  const payload = bytes(strToU8('AIGC\0\0'), zlibSync(strToU8(JSON.stringify({ AIGC: label }))));
  const legacy = Buffer.alloc(payload.length + 12);
  legacy.writeUInt32BE(payload.length);
  legacy.write('zTXt', 4);
  legacy.set(payload, 8);
  // Reading the metadata does not depend on CRC validation; generated chunks own their new CRC.
  const original = bytes(png.slice(0, -12), legacy, png.slice(-12));
  expect(imageMetadata(source(original), 'image/png').label).toEqual(label);
  const stored = rewrite(original, 'image/png', edited);
  expect(pngChunks(stored).some(({ type }) => type === 'zTXt')).toBe(false);
  expect(imageMetadata(source(stored), 'image/png').label).toEqual(edited);
});

test.each([true, false])(
  'reads legacy EXIF with littleEndian=%s while retaining unrelated fields',
  (little) => {
    const text = strToU8(JSON.stringify({ AIGC: label }) + '\0');
    const tiff = new Uint8Array(38 + text.length);
    const data = new DataView(tiff.buffer);
    tiff.set(strToU8(little ? 'II' : 'MM'));
    data.setUint16(2, 42, little);
    data.setUint32(4, 8, little);
    data.setUint16(8, 2, little);
    data.setUint16(10, 0x010e, little);
    data.setUint16(12, 2, little);
    data.setUint32(14, text.length, little);
    data.setUint32(18, 38, little);
    data.setUint16(22, 0x0112, little);
    data.setUint16(24, 3, little);
    data.setUint32(26, 1, little);
    data.setUint16(30, 6, little);
    tiff.set(text, 38);
    const payload = bytes(strToU8('Exif\0\0'), tiff);
    const app1 = new Uint8Array([0xff, 0xe1, 0, 0]);
    new DataView(app1.buffer).setUint16(2, payload.length + 2);
    const original = bytes(jpeg.slice(0, 2), app1, payload, jpeg.slice(2));
    expect(imageMetadata(source(original), 'image/jpeg').label).toEqual(label);
    const stored = rewrite(original, 'image/jpeg', edited);
    expect(imageMetadata(source(stored), 'image/jpeg').label).toEqual(edited);
    expect(stored.slice(12 + 22, 12 + 34)).toEqual(original.slice(12 + 22, 12 + 34));
    expect(stored.slice(-scan.length)).toEqual(scan);
  },
);

test('retains unrelated XMP namespaces and rejects conflicts, entities and invalid bounds', () => {
  const xmp =
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:title="原作者"/></rdf:RDF></x:xmpmeta>';
  const stored = writeAiContentXmp(xmp, label);
  expect(stored).toContain('dc:title="原作者"');
  expect(readAiContentXmp(stored)).toEqual(label);
  expect(readAiContentXmp(writeAiContentXmp(stored, null))).toBeNull();
  expect(() => readAiContentXmp('<!DOCTYPE x [<!ENTITY a "test">]>' + stored)).toThrow();
  expect(() => imageMetadata(source(png.slice(0, -1)), 'image/png', label)).toThrow();
  expect(() => imageMetadata(source(webp(lossless).slice(0, -1)), 'image/webp', label)).toThrow();
  expect(() => imageMetadata(source(gif.slice(0, -1)), 'image/gif', label)).toThrow();
});
