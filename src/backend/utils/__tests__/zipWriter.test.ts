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
    { onProgress: (done, total) => progress.push([done, total]) },
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
  const totalBytes = 70 * 1024 + 5;
  expect(progress[0]).toEqual([0, totalBytes]);
  expect(progress).toContainEqual([2 + 65536, totalBytes]);
  expect(progress).toContainEqual([2 + large.length, totalBytes]);
  expect(progress.at(-1)).toEqual([totalBytes, totalBytes]);
  for (const [index, [done, total]] of progress.entries()) {
    expect(Number.isSafeInteger(done)).toBe(true);
    expect(Number.isSafeInteger(total)).toBe(true);
    expect(total).toBe(totalBytes);
    expect(done).toBeGreaterThanOrEqual(index === 0 ? 0 : progress[index - 1]![0]);
    expect(done).toBeLessThanOrEqual(total);
  }
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

test.each([0, 1])(
  'cancels during chunk yield %i without further progress and closes handles',
  async (yieldIndex) => {
    jest.useFakeTimers();
    const input = source(new Uint8Array(2 * 65536));
    const output = destination();
    const sourceOpen = jest.spyOn(input, 'open');
    const outputOpen = jest.spyOn(output, 'open');
    const controller = new AbortController();
    const progress = jest.fn();
    const writing = writeZipFile(output, [{ name: 'db', file: input, compression: 1 }], {
      signal: controller.signal,
      onProgress: progress,
    });
    const rejected = expect(writing).rejects.toThrow('cancelled');
    try {
      if (yieldIndex === 1) {
        jest.advanceTimersToNextTimer();
        await Promise.resolve();
      }
      const sourceHandle = sourceOpen.mock.results[0]!.value;
      const outputHandle = outputOpen.mock.results[0]!.value;
      const read = jest.spyOn(sourceHandle, 'readBytesSync');
      const sourceClose = jest.spyOn(sourceHandle, 'close');
      const outputClose = jest.spyOn(outputHandle, 'close');
      const notifications = progress.mock.calls.slice();
      controller.abort(new Error('cancelled'));
      await jest.runAllTimersAsync();
      await rejected;
      expect(progress.mock.calls).toEqual(notifications);
      expect(progress).not.toHaveBeenCalledWith(input.size, input.size);
      expect(read).not.toHaveBeenCalled();
      expect(sourceClose).toHaveBeenCalledTimes(1);
      expect(outputClose).toHaveBeenCalledTimes(1);
      await expect(output.bytes()).resolves.toBeDefined();
    } finally {
      jest.useRealTimers();
    }
  },
);

test.each([0, 2])('rejects content beyond a fixed file budget of %i', async (size) => {
  const input = source(strToU8('abc'));
  Object.defineProperty(input, 'size', { value: size });
  const progress = jest.fn();
  await expect(
    writeZipFile(destination(), [{ name: 'db', file: input, compression: 1 }], {
      onProgress: progress,
    }),
  ).rejects.toThrow('ZIP source file exceeded its size');
  if (size > 0) expect(progress).not.toHaveBeenCalledWith(size, size);
});

test.each([null, undefined, NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid measured size %p before publishing progress',
  async (size) => {
    const input = source(strToU8('abc'));
    Object.defineProperty(input, 'size', { value: size });
    const progress = jest.fn();
    await expect(
      writeZipFile(destination(), [{ name: 'db', file: input, compression: 1 }], {
        onProgress: progress,
      }),
    ).rejects.toThrow('Invalid ZIP source size');
    expect(progress).not.toHaveBeenCalled();
  },
);

test.each([2, NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
  'rejects mismatched or invalid expected size %p',
  async (expectedSize) => {
    const progress = jest.fn();
    await expect(
      writeZipFile(
        destination(),
        [{ name: 'db', file: source(strToU8('abc')), expectedSize, compression: 1 }],
        { onProgress: progress },
      ),
    ).rejects.toThrow('ZIP source size does not match expected size');
    expect(progress).not.toHaveBeenCalled();
  },
);

test('rejects unsafe cumulative source sizes before publishing progress', async () => {
  const input = source(new Uint8Array());
  Object.defineProperty(input, 'size', { value: Number.MAX_SAFE_INTEGER });
  const progress = jest.fn();
  await expect(
    writeZipFile(
      destination(),
      [
        { name: 'a', file: input, compression: 1 },
        { name: 'b', bytes: new Uint8Array(1), compression: 1 },
      ],
      { onProgress: progress },
    ),
  ).rejects.toThrow('Invalid ZIP total source size');
  expect(progress).not.toHaveBeenCalled();
});

test('snapshots a file size once and publishes terminal progress only after handles close', async () => {
  const input = source(strToU8('abc'));
  const size = jest.spyOn(input, 'size', 'get').mockReturnValueOnce(3).mockReturnValue(99);
  const output = destination();
  const sourceOpen = jest.spyOn(input, 'open');
  const outputOpen = jest.spyOn(output, 'open');
  let sourceClose: jest.SpyInstance | undefined;
  let outputClose: jest.SpyInstance | undefined;
  const progress: [number, number][] = [];
  const writing = writeZipFile(
    output,
    [{ name: 'db', file: input, expectedSize: 3, compression: 1 }],
    {
      onProgress: (done, total) => {
        progress.push([done, total]);
        if (done === 0) {
          outputClose = jest.spyOn(outputOpen.mock.results[0]!.value, 'close');
        } else {
          expect(sourceClose).toHaveBeenCalledTimes(1);
          expect(outputClose).toHaveBeenCalledTimes(1);
        }
      },
    },
  );
  // The first chunk's yield gives the test access to the opened source handle.
  sourceClose = jest.spyOn(sourceOpen.mock.results[0]!.value, 'close');
  await writing;
  expect(progress.at(-1)).toEqual([3, 3]);
  expect(size).toHaveBeenCalledTimes(1);
});

test('pins memory bytes when the caller replaces the entry descriptor', async () => {
  const bytes = strToU8('a');
  const entry = { name: 'memory', bytes, compression: 'store' as const };
  const output = destination();
  const progress: [number, number][] = [];
  await writeZipFile(output, [entry], {
    onProgress: (done, total) => {
      progress.push([done, total]);
      entry.bytes = strToU8('abc');
    },
  });
  expect(unzipSync(await output.bytes())).toEqual({ memory: bytes });
  expect(progress).toEqual([
    [0, 1],
    [1, 1],
  ]);
});

test('rejects memory bytes resized after preflight', async () => {
  const buffer = new ArrayBuffer(3, { maxByteLength: 3 });
  const progress = jest.fn((done: number) => {
    if (done === 0) buffer.resize(1);
  });
  await expect(
    writeZipFile(
      destination(),
      [{ name: 'memory', bytes: new Uint8Array(buffer), compression: 'store' }],
      { onProgress: progress },
    ),
  ).rejects.toThrow('ZIP source bytes changed size');
  expect(progress).not.toHaveBeenCalledWith(3, 3);
});

test('yields every 64 preflight entries and cancels before output or progress', async () => {
  jest.useFakeTimers();
  try {
    const inputs = Array.from({ length: 129 }, () => source(new Uint8Array()));
    const sizes = inputs.map((input) => jest.spyOn(input, 'size', 'get'));
    const output = destination();
    const create = jest.spyOn(output, 'create');
    const progress = jest.fn();
    const controller = new AbortController();
    const writing = writeZipFile(
      output,
      inputs.map((file, index) => ({ name: `${index}`, file, compression: 'store' })),
      { signal: controller.signal, onProgress: progress },
    );
    const rejected = expect(writing).rejects.toThrow('cancelled');
    expect(sizes.filter((size) => size.mock.calls.length)).toHaveLength(64);
    jest.advanceTimersToNextTimer();
    await Promise.resolve();
    expect(sizes.filter((size) => size.mock.calls.length)).toHaveLength(128);
    expect(sizes.slice(0, 128).every((size) => size.mock.calls.length === 1)).toBe(true);
    controller.abort(new Error('cancelled'));
    await jest.runAllTimersAsync();
    await rejected;
    expect(sizes[128]).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(progress).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

test('writes a readable zero-length file without adding progress bytes', async () => {
  const output = destination();
  const outputOpen = jest.spyOn(output, 'open');
  let outputClose: jest.SpyInstance | undefined;
  const progress = jest.fn((done: number, total: number) => {
    expect([done, total]).toEqual([0, 0]);
    outputClose ??= jest.spyOn(outputOpen.mock.results[0]!.value, 'close');
  });
  await writeZipFile(
    output,
    [{ name: 'empty', file: source(new Uint8Array()), expectedSize: 0, compression: 1 }],
    { onProgress: progress },
  );
  expect(progress).toHaveBeenCalledWith(0, 0);
  expect(progress.mock.calls.every(([done, total]) => done === 0 && total === 0)).toBe(true);
  expect(progress.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
    outputClose!.mock.invocationCallOrder[0]!,
  );
  expect(unzipSync(await output.bytes())).toEqual({ empty: new Uint8Array() });
});

test('does not publish terminal progress when output cleanup fails', async () => {
  const output = destination();
  const outputOpen = jest.spyOn(output, 'open');
  const progress = jest.fn((done: number) => {
    if (done === 0)
      jest.spyOn(outputOpen.mock.results[0]!.value, 'close').mockImplementation(() => {
        throw new Error('close failed');
      });
  });
  await expect(
    writeZipFile(output, [{ name: 'a', bytes: strToU8('abc'), compression: 1 }], {
      onProgress: progress,
    }),
  ).rejects.toThrow('close failed');
  expect(progress).not.toHaveBeenCalledWith(3, 3);
});
