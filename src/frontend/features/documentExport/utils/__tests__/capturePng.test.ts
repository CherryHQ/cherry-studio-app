import { capturePng } from '../capturePng';
import type { ImageCapturePlan } from '../imageCapturePlan';

const mockCapture = jest.fn();
const mockReleaseCapture = jest.fn();
const mockReadBytes = jest.fn();
const mockClose = jest.fn();
const mockOpen = jest.fn();
const plan: ImageCapturePlan = {
  width: 720,
  height: 20000,
  scale: 2,
  layoutHeight: 10000,
};

jest.mock('react-native-view-shot', () => ({
  captureRef: (...args: unknown[]) => mockCapture(...args),
  releaseCapture: (uri: string) => mockReleaseCapture(uri),
}));
jest.mock('expo-file-system', () => ({
  FileMode: { ReadOnly: 'r' },
  File: class {
    open(mode: string) {
      return mockOpen(mode);
    }
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCapture.mockResolvedValue('file:///native.png');
  mockOpen.mockReturnValue({ readBytes: mockReadBytes, close: mockClose });
  mockReadBytes.mockReturnValue(pngHeader(plan.width, plan.height));
});

test('retains one native PNG above 16K until the caller releases it', async () => {
  const result = await capturePng(1, plan, new AbortController().signal);
  expect(mockCapture).toHaveBeenCalledTimes(1);
  expect(mockCapture).toHaveBeenCalledWith(1, { format: 'png', result: 'tmpfile' });
  expect(result).toMatchObject({ uri: 'file:///native.png', width: 720, height: 20000 });
  expect(mockOpen).toHaveBeenCalledWith('r');
  expect(mockReadBytes).toHaveBeenCalledWith(24);
  expect(mockClose).toHaveBeenCalledTimes(1);
  expect(mockReleaseCapture).not.toHaveBeenCalled();
  result.release();
  result.release();
  expect(mockReleaseCapture).toHaveBeenCalledTimes(1);
  expect(mockReleaseCapture).toHaveBeenCalledWith('file:///native.png');
});

test('rejects a clipped screenshot and releases its native file', async () => {
  mockReadBytes.mockReturnValue(pngHeader(720, 1024));
  await expect(capturePng(1, plan, new AbortController().signal)).rejects.toMatchObject({
    code: 'capture-failed',
  });
  expect(mockClose).toHaveBeenCalledTimes(1);
  expect(mockReleaseCapture).toHaveBeenCalledWith('file:///native.png');
});

test.each([new Uint8Array(24), new Uint8Array([137, 80, 78, 71])])(
  'rejects an invalid PNG header and closes its file handle',
  async (bytes) => {
    mockReadBytes.mockReturnValue(bytes);
    await expect(capturePng(1, plan, new AbortController().signal)).rejects.toMatchObject({
      code: 'capture-failed',
    });
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockReleaseCapture).toHaveBeenCalledWith('file:///native.png');
  },
);

test('cancelling an in-flight capture releases its late file without reading it', async () => {
  const native = deferred<string>();
  mockCapture.mockReturnValue(native.promise);
  const controller = new AbortController();
  const pending = capturePng(1, plan, controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  native.resolve('file:///late.png');
  await rejected;
  expect(mockReleaseCapture).toHaveBeenCalledWith('file:///late.png');
  expect(mockReadBytes).not.toHaveBeenCalled();
});

test('a header read failure closes the handle and releases the screenshot', async () => {
  mockReadBytes.mockImplementationOnce(() => {
    throw new Error('Read failed');
  });
  await expect(capturePng(1, plan, new AbortController().signal)).rejects.toThrow('Read failed');
  expect(mockClose).toHaveBeenCalledTimes(1);
  expect(mockReleaseCapture).toHaveBeenCalledWith('file:///native.png');
});

function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(24);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x89504e47);
  view.setUint32(4, 0x0d0a1a0a);
  view.setUint32(8, 13);
  view.setUint32(12, 0x49484452);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
