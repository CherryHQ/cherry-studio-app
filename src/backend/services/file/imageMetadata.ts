import { strToU8, Unzlib } from 'fflate/browser';

import { AiContentLabelSchema, type AiContentLabel } from '@/shared/data/types/aiContent';

import { decodeManagedUtf8 } from './utf8Text';
import { MAX_AI_METADATA_BYTES, readAiContentXmp, writeAiContentXmp } from './xmpMetadata';

/** Random access keeps image pixels on disk while only small metadata blocks enter JS. */
export type ImageMetadataSource = {
  size: number;
  read(offset: number, length: number): Uint8Array;
};
export type ImageMetadataPart = Uint8Array | { offset: number; length: number };
type Replacement = { start: number; end: number; bytes: Uint8Array };
type XmpBlock = { start: number; end: number; text: string; encode(text: string): Uint8Array };
type Inventory = {
  xmp: XmpBlock[];
  legacy: { start: number; end: number; label: AiContentLabel; clear?: Uint8Array }[];
  insert: number;
  encode(text: string): Uint8Array;
  replacements: Replacement[];
  webp: boolean;
};
const JPEG_XMP = 'http://ns.adobe.com/xap/1.0/\0';
const PNG_XMP = 'XML:com.adobe.xmp';

function read(source: ImageMetadataSource, offset: number, length: number): Uint8Array {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > source.size
  )
    throw new Error('Invalid image container bounds');
  const result = source.read(offset, length);
  if (result.length !== length) throw new Error('Truncated image container');
  return result;
}

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const ascii = (bytes: Uint8Array) =>
  Array.from(bytes, (value) => String.fromCharCode(value)).join('');

function join(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function metadata(bytes: Uint8Array): string {
  if (bytes.length > MAX_AI_METADATA_BYTES) throw new Error('Oversized image metadata');
  let end = bytes.length;
  while (end && bytes[end - 1] === 0) end--;
  return decodeManagedUtf8(bytes.subarray(0, end), MAX_AI_METADATA_BYTES).text;
}

function inflate(bytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let size = 0;
  const stream = new Unzlib((part) => {
    size += part.length;
    if (size > MAX_AI_METADATA_BYTES) throw new Error('Oversized compressed metadata');
    parts.push(part);
  });
  // Bound each inflate allocation as well as the retained result.
  for (let offset = 0; offset < bytes.length; offset += 1024)
    stream.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length);
  return join(parts);
}

/** Annex B EXIF ImageDescription/UserComment labels; leave unrelated EXIF bytes untouched. */
function exifLabels(source: ImageMetadataSource, start: number, end: number): Inventory['legacy'] {
  if (end - start < 8) return [];
  if (ascii(read(source, start, 6)) === 'Exif\0\0') start += 6;
  if (end - start < 8) return [];
  const header = read(source, start, 8);
  const order = ascii(header.subarray(0, 2));
  if (order !== 'II' && order !== 'MM') return [];
  const little = order === 'II';
  if (view(header).getUint16(2, little) !== 42) return [];
  const readExif = (offset: number, length: number) => {
    if (offset < start || offset + length > end) throw new Error('Invalid EXIF metadata bounds');
    return read(source, offset, length);
  };
  const pending = [view(header).getUint32(4, little)];
  const visited = new Set<number>();
  const labels: Inventory['legacy'] = [];
  while (pending.length) {
    const relative = pending.pop()!;
    if (!relative || visited.has(relative)) continue;
    if (visited.size >= 4) throw new Error('Too many EXIF metadata directories');
    visited.add(relative);
    const directory = start + relative;
    const count = view(readExif(directory, 2)).getUint16(0, little);
    if (count > 4096) throw new Error('Too many EXIF metadata entries');
    readExif(directory + 2, count * 12);
    for (let index = 0; index < count; index++) {
      const offset = directory + 2 + index * 12;
      const entry = readExif(offset, 12);
      const fields = view(entry);
      const tag = fields.getUint16(0, little);
      const type = fields.getUint16(2, little);
      const length = fields.getUint32(4, little);
      if (tag === 0x8769 && type === 4 && length === 1) pending.push(fields.getUint32(8, little));
      if ((tag !== 0x010e && tag !== 0x9286) || (type !== 2 && type !== 7) || !length) continue;
      const valueOffset = length <= 4 ? offset + 8 : start + fields.getUint32(8, little);
      const prefix = readExif(valueOffset, Math.min(length, 24));
      const skip = tag === 0x9286 && ascii(prefix.subarray(0, 8)) === 'ASCII\0\0\0' ? 8 : 0;
      if (!/^\s*\{/.test(ascii(prefix.subarray(skip)))) continue;
      if (length > MAX_AI_METADATA_BYTES) throw new Error('Oversized EXIF description');
      const text = metadata(readExif(valueOffset + skip, length - skip));
      if (!/"AIGC"\s*:/.test(text)) continue;
      const value = JSON.parse(text);
      if (!Object.hasOwn(value, 'AIGC')) continue;
      const clear = entry.slice();
      view(clear).setUint32(4, 1, little);
      clear.fill(0, 8);
      labels.push({
        start: offset,
        end: offset + 12,
        label: AiContentLabelSchema.parse(value.AIGC),
        clear,
      });
    }
  }
  return labels;
}

function pngChunk(type: string, bytes: Uint8Array): Uint8Array {
  const output = new Uint8Array(bytes.length + 12);
  const data = view(output);
  data.setUint32(0, bytes.length);
  output.set(strToU8(type), 4);
  output.set(bytes, 8);
  let crc = 0xffffffff;
  for (const value of output.subarray(4, output.length - 4)) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  data.setUint32(output.length - 4, (crc ^ 0xffffffff) >>> 0);
  return output;
}

function png(source: ImageMetadataSource): Inventory {
  if (ascii(read(source, 0, 8)) !== '\x89PNG\r\n\x1a\n') throw new Error('Invalid PNG signature');
  const encode = (text: string) =>
    pngChunk('iTXt', join([strToU8(PNG_XMP + '\0'), new Uint8Array(4), strToU8(text)]));
  const result: Inventory = {
    xmp: [],
    legacy: [],
    insert: 0,
    encode,
    replacements: [],
    webp: false,
  };
  let offset = 8;
  let first = true;
  while (offset < source.size) {
    const header = read(source, offset, 8);
    const size = view(header).getUint32(0);
    const type = ascii(header.subarray(4));
    const end = offset + 12 + size;
    if (end > source.size || (first && (type !== 'IHDR' || size !== 13)))
      throw new Error('Invalid PNG chunk');
    first = false;
    if (['iTXt', 'tEXt', 'zTXt'].includes(type)) {
      const prefix = read(source, offset + 8, Math.min(size, 80));
      const zero = prefix.indexOf(0);
      const keyword = zero < 0 ? '' : ascii(prefix.subarray(0, zero));
      if (keyword === PNG_XMP || keyword === 'AIGC') {
        if (size > MAX_AI_METADATA_BYTES) throw new Error('Oversized PNG metadata');
        const bytes = read(source, offset + 8, size);
        let textBytes = bytes.subarray(zero + 1);
        if (type === 'iTXt') {
          if (textBytes.length < 4 || textBytes[0] > 1 || textBytes[1] !== 0)
            throw new Error('Invalid PNG text metadata');
          const compressed = textBytes[0] === 1;
          let position = 2;
          for (let field = 0; field < 2; field++) {
            const next = textBytes.indexOf(0, position);
            if (next < 0) throw new Error('Invalid PNG text fields');
            position = next + 1;
          }
          textBytes = compressed
            ? inflate(textBytes.subarray(position))
            : textBytes.subarray(position);
        } else if (type === 'zTXt') {
          if (textBytes[0] !== 0) throw new Error('Invalid PNG compression method');
          textBytes = inflate(textBytes.subarray(1));
        }
        const text = metadata(textBytes);
        if (keyword === PNG_XMP) result.xmp.push({ start: offset, end, text, encode });
        else {
          const value = JSON.parse(text);
          result.legacy.push({
            start: offset,
            end,
            label: AiContentLabelSchema.parse(value.AIGC ?? value),
          });
        }
      }
    }
    if (type === 'IEND') {
      if (size !== 0 || end !== source.size) throw new Error('Invalid PNG end chunk');
      result.insert = offset;
      return result;
    }
    offset = end;
  }
  throw new Error('Missing PNG end chunk');
}

function jpeg(source: ImageMetadataSource): Inventory {
  if (view(read(source, 0, 2)).getUint16(0) !== 0xffd8) throw new Error('Invalid JPEG signature');
  const encode = (text: string) => {
    const bytes = join([strToU8(JPEG_XMP), strToU8(text)]);
    if (bytes.length > 65533) throw new Error('JPEG XMP metadata exceeds APP1 capacity');
    const header = new Uint8Array([0xff, 0xe1, 0, 0]);
    view(header).setUint16(2, bytes.length + 2);
    return join([header, bytes]);
  };
  const result: Inventory = {
    xmp: [],
    legacy: [],
    insert: 2,
    encode,
    replacements: [],
    webp: false,
  };
  let offset = 2;
  while (offset < source.size) {
    const start = offset;
    if (read(source, offset++, 1)[0] !== 0xff) throw new Error('Invalid JPEG marker');
    while (read(source, offset, 1)[0] === 0xff) offset++;
    const marker = read(source, offset++, 1)[0];
    if (marker === 0xda || marker === 0xd9) {
      result.insert = start;
      return result;
    }
    if (marker === 0x00 || marker === 0xd8) throw new Error('Invalid JPEG segment');
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const size = view(read(source, offset, 2)).getUint16(0);
    if (size < 2 || offset + size > source.size) throw new Error('Invalid JPEG segment length');
    if (
      marker === 0xe1 &&
      size >= JPEG_XMP.length + 2 &&
      ascii(read(source, offset + 2, JPEG_XMP.length)) === JPEG_XMP
    ) {
      const text = metadata(read(source, offset + 2 + JPEG_XMP.length, size - 2 - JPEG_XMP.length));
      result.xmp.push({ start, end: offset + size, text, encode });
    } else if (marker === 0xe1 && size >= 8 && ascii(read(source, offset + 2, 6)) === 'Exif\0\0') {
      result.legacy.push(...exifLabels(source, offset + 2, offset + size));
    }
    offset += size;
  }
  throw new Error('Missing JPEG image data');
}

function riffChunk(type: string, bytes: Uint8Array): Uint8Array {
  const output = new Uint8Array(8 + bytes.length + (bytes.length & 1));
  output.set(strToU8(type));
  view(output).setUint32(4, bytes.length, true);
  output.set(bytes, 8);
  return output;
}

function webp(source: ImageMetadataSource): Inventory {
  const header = read(source, 0, 12);
  if (
    ascii(header.subarray(0, 4)) !== 'RIFF' ||
    ascii(header.subarray(8)) !== 'WEBP' ||
    view(header).getUint32(4, true) + 8 !== source.size
  )
    throw new Error('Invalid WebP container');
  const encode = (text: string) => riffChunk('XMP ', strToU8(text));
  const result: Inventory = {
    xmp: [],
    legacy: [],
    insert: source.size,
    encode,
    replacements: [],
    webp: true,
  };
  let offset = 12;
  let extended: Uint8Array | undefined;
  let width = 0;
  let height = 0;
  let flags = 0x04;
  while (offset < source.size) {
    const chunk = read(source, offset, 8);
    const type = ascii(chunk.subarray(0, 4));
    const size = view(chunk).getUint32(4, true);
    const end = offset + 8 + size + (size & 1);
    if (end > source.size) throw new Error('Invalid WebP chunk');
    if (type === 'VP8X') {
      if (extended || offset !== 12 || size !== 10) throw new Error('Invalid WebP extended header');
      extended = read(source, offset + 8, size).slice();
      extended[0] |= 0x04;
      result.replacements.push({ start: offset, end, bytes: riffChunk(type, extended) });
    } else if (type === 'XMP ') {
      if (size > MAX_AI_METADATA_BYTES) throw new Error('Oversized WebP metadata');
      result.xmp.push({
        start: offset,
        end,
        text: metadata(read(source, offset + 8, size)),
        encode,
      });
    } else if (type === 'VP8 ' && !extended) {
      const bytes = read(source, offset + 8, Math.min(size, 10));
      if (bytes.length < 10 || ascii(bytes.subarray(3, 6)) !== '\x9d\x01\x2a')
        throw new Error('Invalid WebP VP8 frame');
      width = view(bytes).getUint16(6, true) & 0x3fff;
      height = view(bytes).getUint16(8, true) & 0x3fff;
    } else if (type === 'VP8L' && !extended) {
      const bytes = read(source, offset + 8, Math.min(size, 5));
      if (bytes.length < 5 || bytes[0] !== 0x2f) throw new Error('Invalid WebP lossless frame');
      const dimensions = view(bytes).getUint32(1, true);
      width = (dimensions & 0x3fff) + 1;
      height = ((dimensions >>> 14) & 0x3fff) + 1;
      if (dimensions & 0x10000000) flags |= 0x10;
    }
    if (type === 'ICCP') flags |= 0x20;
    if (type === 'EXIF') {
      flags |= 0x08;
      result.legacy.push(...exifLabels(source, offset + 8, offset + 8 + size));
    }
    if (type === 'ALPH') flags |= 0x10;
    if (type === 'ANIM' || type === 'ANMF') flags |= 0x02;
    offset = end;
  }
  if (!extended) {
    if (!width || !height || flags & 0x02) throw new Error('Missing WebP dimensions');
    const bytes = new Uint8Array(10);
    bytes[0] = flags;
    for (let i = 0; i < 3; i++) {
      bytes[4 + i] = ((width - 1) >>> (8 * i)) & 0xff;
      bytes[7 + i] = ((height - 1) >>> (8 * i)) & 0xff;
    }
    result.replacements.push({ start: 12, end: 12, bytes: riffChunk('VP8X', bytes) });
  }
  return result;
}

function gif(source: ImageMetadataSource): Inventory {
  const header = read(source, 0, 13);
  if (!['GIF87a', 'GIF89a'].includes(ascii(header.subarray(0, 6))))
    throw new Error('Invalid GIF signature');
  const encode = (text: string) => {
    const trailer = new Uint8Array(258);
    trailer[0] = 1;
    for (let index = 1; index <= 255; index++) trailer[index] = 256 - index;
    return join([new Uint8Array([0x21, 0xff, 11]), strToU8('XMP DataXMP'), strToU8(text), trailer]);
  };
  const result: Inventory = {
    xmp: [],
    legacy: [],
    insert: 0,
    encode,
    webp: false,
    replacements: [{ start: 0, end: 6, bytes: strToU8('GIF89a') }],
  };
  const skipBlocks = (start: number) => {
    let offset = start;
    for (;;) {
      const size = read(source, offset++, 1)[0];
      if (!size) return offset;
      if (offset + size > source.size) throw new Error('Invalid GIF sub-block');
      offset += size;
    }
  };
  let offset = 13 + (header[10] & 0x80 ? 3 * (1 << ((header[10] & 7) + 1)) : 0);
  while (offset < source.size) {
    const start = offset;
    const marker = read(source, offset++, 1)[0];
    if (marker === 0x3b) {
      if (offset !== source.size) throw new Error('Unexpected GIF trailing data');
      result.insert = start;
      return result;
    }
    if (marker === 0x2c) {
      const descriptor = read(source, offset, 9);
      offset += 9 + (descriptor[8] & 0x80 ? 3 * (1 << ((descriptor[8] & 7) + 1)) : 0);
      read(source, offset++, 1);
      offset = skipBlocks(offset);
    } else if (marker === 0x21) {
      const kind = read(source, offset++, 1)[0];
      if (
        kind === 0xff &&
        read(source, offset, 1)[0] === 11 &&
        ascii(read(source, offset + 1, 11)) === 'XMP DataXMP'
      ) {
        const packet = offset + 12;
        const end = skipBlocks(packet);
        const length = end - packet - 258;
        if (length < 0 || length > MAX_AI_METADATA_BYTES)
          throw new Error('Invalid GIF XMP metadata');
        result.xmp.push({ start, end, text: metadata(read(source, packet, length)), encode });
        offset = end;
      } else offset = skipBlocks(offset);
    } else throw new Error('Invalid GIF block');
  }
  throw new Error('Missing GIF trailer');
}

/** Returns a copy plan; original pixel ranges are passed through without decoding. */
export function imageMetadata(
  source: ImageMetadataSource,
  mediaType: string,
  label?: AiContentLabel | null,
): { label: AiContentLabel | null; parts: ImageMetadataPart[] } {
  const inventory = (
    { 'image/png': png, 'image/jpeg': jpeg, 'image/webp': webp, 'image/gif': gif } as Record<
      string,
      (source: ImageMetadataSource) => Inventory
    >
  )[mediaType]?.(source);
  if (!inventory) throw new Error('Unsupported image metadata format');
  const labels = [
    ...inventory.xmp.map((block) => readAiContentXmp(block.text)),
    ...inventory.legacy.map((block) => block.label),
  ].filter((value) => value !== null);
  if (
    label === undefined &&
    labels.some((value) => JSON.stringify(value) !== JSON.stringify(labels[0]))
  )
    throw new Error('Conflicting image AIGC metadata');
  if (label === undefined || (label === null && !labels.length))
    return {
      label: label === null ? null : (labels[0] ?? null),
      parts: [{ offset: 0, length: source.size }],
    };
  const replacements = label === null && !inventory.xmp.length ? [] : [...inventory.replacements];
  inventory.xmp.forEach((block, index) =>
    replacements.push({
      start: block.start,
      end: block.end,
      bytes: block.encode(writeAiContentXmp(block.text, index === 0 ? label : null)),
    }),
  );
  for (const block of inventory.legacy)
    replacements.push({
      start: block.start,
      end: block.end,
      bytes: block.clear ?? new Uint8Array(),
    });
  if (label && !inventory.xmp.length)
    replacements.push({
      start: inventory.insert,
      end: inventory.insert,
      bytes: inventory.encode(writeAiContentXmp(undefined, label)),
    });
  replacements.sort((a, b) => a.start - b.start || a.end - b.end);
  const parts: ImageMetadataPart[] = [];
  let position = 0;
  for (const replacement of replacements) {
    if (replacement.start < position) throw new Error('Overlapping image metadata');
    if (replacement.start > position)
      parts.push({ offset: position, length: replacement.start - position });
    parts.push(replacement.bytes);
    position = replacement.end;
  }
  if (position < source.size) parts.push({ offset: position, length: source.size - position });
  if (inventory.webp) {
    const size = parts.reduce((sum, part) => sum + part.length, 0);
    if (size > 0xfffffffe) throw new Error('WebP exceeds container capacity');
    const header = read(source, 0, 12).slice();
    view(header).setUint32(4, size - 8, true);
    // The first range always starts at zero and includes the original RIFF header.
    const first = parts.shift();
    if (!first || first instanceof Uint8Array || first.offset !== 0 || first.length < 12)
      throw new Error('Invalid WebP rewrite plan');
    parts.unshift(header, { offset: 12, length: first.length - 12 });
  }
  return { label, parts };
}
