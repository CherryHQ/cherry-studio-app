import { File } from 'expo-file-system';
import { strFromU8, strToU8, unzipSync } from 'fflate';

import { writeZipFile } from '../zipWriter';

jest.mock('expo-file-system', () => {
  const files = new Map<string, Uint8Array>();
  class MockFile {
    uri: string;

    constructor(uri: string) {
      this.uri = uri;
    }

    get size() {
      return files.get(this.uri)?.length ?? 0;
    }

    create() {
      if (files.has(this.uri)) throw new Error('File already exists');
      files.set(this.uri, new Uint8Array());
    }

    writeSync(bytes: Uint8Array) {
      files.set(this.uri, bytes);
    }

    bytes() {
      return Promise.resolve(files.get(this.uri)!);
    }

    open(mode: string) {
      const fileUri = this.uri;
      let offset = 0;
      return {
        readBytesSync(length: number) {
          const bytes = files.get(fileUri)!.slice(offset, offset + length);
          offset += bytes.length;
          return bytes;
        },
        writeBytesSync(bytes: Uint8Array) {
          if (mode !== 'write') throw new Error('Read-only handle');
          const next = new Uint8Array(files.get(fileUri)!.length + bytes.length);
          next.set(files.get(fileUri)!);
          next.set(bytes, next.length - bytes.length);
          files.set(fileUri, next);
        },
        close() {},
      };
    }
  }
  return { File: MockFile, FileMode: { ReadOnly: 'read', WriteOnly: 'write' } };
});

let fileNumber = 0;
function source(bytes: Uint8Array) {
  const file = new File(`file:///source-${++fileNumber}`);
  file.writeSync(bytes);
  return file;
}
const destination = () => new File(`file:///archive-${++fileNumber}.zip`);

/** Compression method of each central-directory record, in archive order. */
function compressionMethods(archive: Uint8Array) {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const end = archive.length - 22;
  const methods: [string, number][] = [];
  for (let offset = view.getUint32(end + 16, true); offset < end;) {
    const nameLength = view.getUint16(offset + 28, true);
    methods.push([
      strFromU8(archive.subarray(offset + 46, offset + 46 + nameLength)),
      view.getUint16(offset + 10, true),
    ]);
    offset +=
      46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  return methods;
}

test('writes memory and chunked file entries in order with their compression', async () => {
  const large = new Uint8Array(70 * 1024).map((_, index) => index % 251);
  const output = destination();
  const progress: [number, number][] = [];
  await writeZipFile(
    output,
    [
      { name: 'diagnostics.json', bytes: strToU8('{}'), compression: 6 },
      { name: 'logs/app.log', file: source(large), compression: 1 },
      { name: 'files/photo.png', file: source(strToU8('png')), compression: 'store' },
      { name: 'empty.txt', file: source(new Uint8Array()), compression: 6 },
    ],
    { onEntryWritten: (done, total) => progress.push([done, total]) },
  );
  const archive = await output.bytes();
  expect(compressionMethods(archive)).toEqual([
    ['diagnostics.json', 8],
    ['logs/app.log', 8],
    ['files/photo.png', 0],
    ['empty.txt', 8],
  ]);
  expect(unzipSync(archive)).toEqual({
    'diagnostics.json': strToU8('{}'),
    'logs/app.log': large,
    'files/photo.png': strToU8('png'),
    'empty.txt': new Uint8Array(),
  });
  expect(progress).toEqual([
    [1, 4],
    [2, 4],
    [3, 4],
    [4, 4],
  ]);
});

test.each(['../escape.txt', 'logs//app.log', './app.log', 'logs\\app.log', ''])(
  'rejects the unsafe entry name %p',
  async (name) => {
    await expect(
      writeZipFile(destination(), [{ name, bytes: strToU8('x'), compression: 6 }]),
    ).rejects.toThrow('Invalid ZIP entry name');
  },
);

test('stops at the archive size limit, a truncated source and cancellation', async () => {
  await expect(
    writeZipFile(destination(), [{ name: 'a.txt', bytes: strToU8('abc'), compression: 'store' }], {
      limit: { bytes: 10, error: () => new Error('too-large') },
    }),
  ).rejects.toThrow('too-large');

  const shrinking = source(strToU8('abc'));
  Object.defineProperty(shrinking, 'size', { value: 4 });
  await expect(
    writeZipFile(destination(), [{ name: 'a.txt', file: shrinking, compression: 6 }]),
  ).rejects.toThrow('ZIP source file was truncated');

  const controller = new AbortController();
  controller.abort(new Error('cancelled'));
  await expect(
    writeZipFile(destination(), [{ name: 'a.txt', bytes: strToU8('abc'), compression: 6 }], {
      signal: controller.signal,
    }),
  ).rejects.toThrow('cancelled');
});
