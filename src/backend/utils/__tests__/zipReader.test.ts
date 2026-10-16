import { strFromU8, strToU8, Zip, ZipDeflate, ZipPassThrough, zipSync } from 'fflate';

import {
  extractZipEntries,
  readZipDirectory,
  type ZipDirectoryOptions,
  type ZipRecord,
} from '../zipReader';

const memory = (bytes: Uint8Array) => ({
  size: bytes.length,
  read: (offset: number, length: number) => bytes.subarray(offset, offset + length),
});

const format = {
  invalid: (reason: 'malformed' | 'missing-directory') => new Error(reason),
  decodeName: (bytes: Uint8Array) => strFromU8(bytes),
};

function options(overrides: Partial<ZipDirectoryOptions> = {}): ZipDirectoryOptions {
  return {
    ...format,
    tooLarge: () => new Error('too-large'),
    maxRecords: 10,
    maxExpandedBytes: 1024,
    checkRecord: () => {},
    ...overrides,
  };
}

/** Streams entries the way the backup writer does, with data descriptors after each payload. */
function streamedZip(files: Record<string, Uint8Array>) {
  const chunks: Uint8Array[] = [];
  const zip = new Zip((error, chunk) => {
    if (error) throw error;
    chunks.push(chunk);
  });
  for (const [name, bytes] of Object.entries(files)) {
    const entry = name.endsWith('.db') ? new ZipDeflate(name) : new ZipPassThrough(name);
    zip.add(entry);
    entry.push(bytes, true);
  }
  zip.end();
  const archive = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    archive.set(chunk, offset);
    offset += chunk.length;
  }
  return archive;
}

async function extract(
  archive: Uint8Array,
  extractOptions: { contiguous?: boolean; verifyCrc?: boolean } = {},
) {
  const source = memory(archive);
  const files: Record<string, string> = {};
  const positions: number[] = [];
  await extractZipEntries(source, readZipDirectory(source, options()), {
    ...format,
    ...extractOptions,
    onRead: (position) => positions.push(position),
    open: (entry) => {
      files[entry.name] = '';
      return { write: (chunk) => (files[entry.name] += strFromU8(chunk)) };
    },
  });
  return { files, positions };
}

const directoryStart = (zip: Uint8Array) =>
  new DataView(zip.buffer, zip.byteOffset).getUint32(zip.length - 6, true);

describe('central directory', () => {
  const archive = () =>
    zipSync({ 'manifest.json': strToU8('{}'), 'database/cherry.db': strToU8('fixture') });

  test('lists file entries in archive order and passes every record to the domain policy', () => {
    const records: ZipRecord[] = [];
    const zip = zipSync({
      'b.txt': strToU8('b'),
      'docs/': new Uint8Array(),
      'a.txt': strToU8('aa'),
    });
    const directory = readZipDirectory(
      memory(zip),
      options({ allowDirectories: true, checkRecord: (record) => records.push(record) }),
    );
    expect(directory.entries.map((entry) => [entry.name, entry.size])).toEqual([
      ['b.txt', 1],
      ['a.txt', 2],
    ]);
    expect(directory.start).toBe(directoryStart(zip));
    expect(records).toEqual([
      { name: 'b.txt', path: 'b.txt', directory: false, size: 1 },
      { name: 'docs/', path: 'docs', directory: true, size: 0 },
      { name: 'a.txt', path: 'a.txt', directory: false, size: 2 },
    ]);
    // Without directory support a trailing slash reaches the path policy unchanged.
    const names: string[] = [];
    readZipDirectory(memory(zip), options({ checkRecord: ({ name }) => names.push(name) }));
    expect(names).toContain('docs/');
  });

  test('rejects a truncated ZIP even when all individual file payloads are present', () => {
    const zip = archive();
    for (const length of [directoryStart(zip), zip.length - 1, zip.length - 10]) {
      expect(() => readZipDirectory(memory(zip.subarray(0, length)), options())).toThrow(
        'missing-directory',
      );
    }
  });

  test('rejects appended payloads, multidisk archives and central directory offset corruption', () => {
    const zip = archive();
    const appended = new Uint8Array(zip.length + 1);
    appended.set(zip);
    expect(() => readZipDirectory(memory(appended), options())).toThrow();
    for (const relativeOffset of [4, 16]) {
      const changed = zip.slice();
      changed[changed.length - 22 + relativeOffset] = 1;
      expect(() => readZipDirectory(memory(changed), options())).toThrow('malformed');
    }
  });

  test.each([
    ['encrypted', (view: DataView, at: number) => view.setUint16(at + 8, 1, true)],
    ['unsupported compression', (view: DataView, at: number) => view.setUint16(at + 10, 12, true)],
    ['symlink', (view: DataView, at: number) => view.setUint32(at + 38, 0xa1ff0000, true)],
    ['ZIP64 size', (view: DataView, at: number) => view.setUint32(at + 24, 0xffffffff, true)],
    ['another disk', (view: DataView, at: number) => view.setUint16(at + 34, 1, true)],
    ['data after the directory', (view: DataView, at: number) => view.setUint32(at + 42, at, true)],
  ])('rejects %s entries before they can be extracted', (_, corrupt) => {
    const zip = archive();
    corrupt(new DataView(zip.buffer), directoryStart(zip));
    expect(() => readZipDirectory(memory(zip), options())).toThrow('malformed');
  });

  test('applies record, name, duplicate and expansion limits', () => {
    const zip = archive();
    expect(() => readZipDirectory(memory(zip), options({ maxRecords: 1 }))).toThrow('malformed');
    expect(() => readZipDirectory(memory(zip), options({ maxNameBytes: 13 }))).toThrow('malformed');
    expect(() => readZipDirectory(memory(zip), options({ maxExpandedBytes: 8 }))).toThrow(
      'too-large',
    );
    expect(() => readZipDirectory(memory(zip), options({ decodeName: () => null }))).toThrow(
      'malformed',
    );
    const duplicate = zipSync({ 'a.txt': strToU8('a'), 'b.txt': strToU8('b') });
    const view = new DataView(duplicate.buffer);
    const second = directoryStart(duplicate) + 46 + 'a.txt'.length;
    expect(view.getUint32(second, true)).toBe(0x02014b50);
    duplicate.set(strToU8('a.txt'), second + 46);
    expect(() => readZipDirectory(memory(duplicate), options())).toThrow('malformed');
  });
});

describe('extraction', () => {
  test('streams deflated and stored entries with progress positions', async () => {
    const zip = zipSync({
      'notes.txt': [strToU8('stored'), { level: 0 }],
      'data.db': strToU8('deflated'.repeat(10)),
    });
    const { files, positions } = await extract(zip, { verifyCrc: true });
    expect(files).toEqual({ 'notes.txt': 'stored', 'data.db': 'deflated'.repeat(10) });
    expect(positions.at(-1)).toBeLessThanOrEqual(directoryStart(zip));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  test('requires back-to-back entries and checks data descriptors in contiguous mode', async () => {
    const zip = streamedZip({ 'manifest.json': strToU8('{}'), 'cherry.db': strToU8('fixture') });
    await expect(extract(zip, { contiguous: true })).resolves.toMatchObject({
      files: { 'manifest.json': '{}', 'cherry.db': 'fixture' },
    });
    // The first descriptor follows the 2-byte stored payload of `manifest.json`.
    const descriptor = 30 + 'manifest.json'.length + 2;
    const corrupt = zip.slice();
    corrupt[descriptor + 4] ^= 1;
    await expect(extract(corrupt, { contiguous: true })).rejects.toThrow('malformed');
    // Without layout checks descriptors are trailing bytes between entries.
    await expect(extract(corrupt)).resolves.toBeDefined();
  });

  test('rejects mismatched local headers and corrupt bytes when CRC verification is on', async () => {
    const zip = zipSync({ 'SKILL.md': strToU8('Skill') }, { level: 0 });
    const renamed = zip.slice();
    renamed[30] = 'X'.charCodeAt(0);
    await expect(extract(renamed)).rejects.toThrow('malformed');
    const corrupt = zip.slice();
    const view = new DataView(corrupt.buffer);
    corrupt[30 + view.getUint16(26, true) + view.getUint16(28, true)] ^= 1;
    await expect(extract(corrupt)).resolves.toBeDefined();
    await expect(extract(corrupt, { verifyCrc: true })).rejects.toThrow('malformed');
  });

  test('rejects a stored entry whose sizes disagree before writing it', async () => {
    const zip = zipSync({ 'a.txt': strToU8('abc') }, { level: 0 });
    const view = new DataView(zip.buffer);
    view.setUint32(directoryStart(zip) + 24, 2, true);
    view.setUint32(22, 2, true);
    const open = jest.fn();
    const source = memory(zip);
    await expect(
      extractZipEntries(source, readZipDirectory(source, options()), { ...format, open }),
    ).rejects.toThrow('malformed');
    expect(open).not.toHaveBeenCalled();
  });

  test('closes the sink and honors cancellation before the next entry', async () => {
    const zip = zipSync({ 'a.txt': strToU8('abc'), 'b.txt': strToU8('def') });
    const source = memory(zip);
    const controller = new AbortController();
    const close = jest.fn();
    await expect(
      extractZipEntries(source, readZipDirectory(source, options()), {
        ...format,
        signal: controller.signal,
        open: () => ({
          write: () => controller.abort(new Error('cancelled')),
          close,
        }),
      }),
    ).rejects.toThrow('cancelled');
    expect(close).toHaveBeenCalledTimes(1);
  });
});
