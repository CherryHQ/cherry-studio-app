import { compressImageDataUrl } from '../imageCompression';

jest.mock('expo-file-system', () => {
  const files = new Map<string, number>();
  const reads: string[] = [];
  return {
    File: class {
      constructor(readonly uri: string) {}
      get exists() {
        return files.has(this.uri);
      }
      get size() {
        return files.get(this.uri) ?? 0;
      }
      async base64() {
        reads.push(this.uri);
        return 'SMALL';
      }
      delete() {
        files.delete(this.uri);
      }
    },
    testState: { files, reads },
  };
});

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

const { testState } = jest.requireMock<{
  testState: { files: Map<string, number>; reads: string[] };
}>('expo-file-system');
const { ImageManipulator } = jest.requireMock<{
  ImageManipulator: { manipulate: jest.Mock };
}>('expo-image-manipulator');
const SOURCE = 'file:///managed/original';
const MIB = 1024 * 1024;

function renderer(sizes: number[], onSave?: () => void) {
  const source = { width: 4000, height: 3000, release: jest.fn() };
  const sourceContext = { renderAsync: async () => source, release: jest.fn() };
  const contexts: { resize: jest.Mock; release: jest.Mock }[] = [];
  const outputs: { saveAsync: jest.Mock; release: jest.Mock }[] = [];
  ImageManipulator.manipulate
    .mockImplementation(() => {
      const index = outputs.length;
      const output = {
        release: jest.fn(),
        saveAsync: jest.fn(async () => {
          const uri = `file:///cache/compressed-${index}`;
          testState.files.set(uri, sizes[Math.min(index, sizes.length - 1)]!);
          onSave?.();
          return { uri };
        }),
      };
      const context = { resize: jest.fn(), release: jest.fn(), renderAsync: async () => output };
      contexts.push(context);
      outputs.push(output);
      return context;
    })
    .mockImplementationOnce(() => sourceContext);
  return { source, sourceContext, contexts, outputs };
}

beforeEach(() => {
  jest.resetAllMocks();
  testState.files.clear();
  testState.reads.length = 0;
  testState.files.set(SOURCE, 9 * MIB);
});

test.each(['jpeg', 'png', 'webp'])(
  'reduces a 9 MiB %s image without changing its format or original',
  async (format) => {
    const native = renderer([700_000]);
    await expect(compressImageDataUrl(SOURCE, `image/${format}`)).resolves.toBe(
      `data:image/${format};base64,SMALL`,
    );
    expect(native.contexts[0]?.resize).toHaveBeenCalledWith({ width: 2560, height: 1920 });
    expect(native.outputs[0]?.saveAsync).toHaveBeenCalledWith({ format, compress: 0.85 });
    expect(testState.files).toEqual(new Map([[SOURCE, 9 * MIB]]));
    expect(native.source.release).toHaveBeenCalledTimes(1);
    expect(native.sourceContext.release).toHaveBeenCalledTimes(1);
    expect(native.outputs[0]?.release).toHaveBeenCalledTimes(1);
    expect(native.contexts[0]?.release).toHaveBeenCalledTimes(1);
  },
);

test('checks actual output size and resizes again before encoding an oversized result', async () => {
  const native = renderer([2 * MIB, 700_000]);
  await expect(compressImageDataUrl(SOURCE, 'image/png')).resolves.toBe(
    'data:image/png;base64,SMALL',
  );
  expect(native.outputs).toHaveLength(2);
  expect(testState.reads).toEqual(['file:///cache/compressed-1']);
  expect(testState.files).toEqual(new Map([[SOURCE, 9 * MIB]]));
  expect(ImageManipulator.manipulate).toHaveBeenNthCalledWith(3, native.source);
});

test('does not return a derivative that remains too large', async () => {
  renderer([2 * MIB]);
  await expect(compressImageDataUrl(SOURCE, 'image/png')).resolves.toBeUndefined();
  expect(testState.reads).toEqual([]);
  expect(testState.files).toEqual(new Map([[SOURCE, 9 * MIB]]));
});

test('does not flatten an animated GIF', async () => {
  await expect(compressImageDataUrl(SOURCE, 'image/gif')).resolves.toBeUndefined();
  expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
});

test('cancellation during saving cleans up the derivative and native resources', async () => {
  const controller = new AbortController();
  const native = renderer([700_000], () => controller.abort(new Error('Cancelled')));
  await expect(compressImageDataUrl(SOURCE, 'image/jpeg', controller.signal)).rejects.toThrow(
    'Cancelled',
  );
  expect(testState.reads).toEqual([]);
  expect(testState.files).toEqual(new Map([[SOURCE, 9 * MIB]]));
  expect(native.source.release).toHaveBeenCalledTimes(1);
  expect(native.sourceContext.release).toHaveBeenCalledTimes(1);
  expect(native.outputs[0]?.release).toHaveBeenCalledTimes(1);
  expect(native.contexts[0]?.release).toHaveBeenCalledTimes(1);
});
