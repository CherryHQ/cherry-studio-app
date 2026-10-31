import type { LocalOcrModelState } from '@/shared/contracts/localOcr';

import { createOcrModelDownload } from '../createOcrModelDownload';
import { LOCAL_OCR_MODEL_BYTES, LOCAL_OCR_MODEL_FILES } from '../localOcrModel';

jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

const mockFiles = new Map<string, { size: number; text?: string; digest?: string }>();
let mockHoldTransfer = false;
let mockInvalidDigest = false;
const mockResume = jest.fn();
const mockCreateDownload = jest.fn(
  (
    url: string,
    fileUri: string,
    _options: unknown,
    progress: (value: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void,
    resumeData?: string,
  ) => {
    const model = LOCAL_OCR_MODEL_FILES.find((file) => file.url === url)!;
    let finish: ((value: { status: number } | undefined) => void) | undefined;
    const transfer = async () => {
      if (mockHoldTransfer)
        return new Promise<{ status: number } | undefined>((resolve) => {
          finish = resolve;
          progress({ totalBytesWritten: 100, totalBytesExpectedToWrite: model.bytes });
        });
      mockFiles.set(fileUri, { size: model.bytes, digest: model.sha256 });
      progress({ totalBytesWritten: model.bytes, totalBytesExpectedToWrite: model.bytes });
      return { status: 200 };
    };
    return {
      fileUri,
      downloadAsync: transfer,
      resumeAsync: () => {
        mockResume(resumeData);
        return transfer();
      },
      pauseAsync: async () => {
        finish?.(undefined);
        return { resumeData: 'native-resume-token' };
      },
      cancelAsync: async () => {
        finish?.(undefined);
      },
    };
  },
);

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  getInfoAsync: async (uri: string) => {
    const file = mockFiles.get(uri);
    return file ? { exists: true, isDirectory: false, size: file.size } : { exists: false };
  },
  makeDirectoryAsync: jest.fn(async () => {}),
  getFreeDiskStorageAsync: async () => 2_000_000_000,
  deleteAsync: async (uri: string) => {
    for (const key of mockFiles.keys())
      if (key === uri || key.startsWith(uri + (uri.endsWith('/') ? '' : '/')))
        mockFiles.delete(key);
  },
  moveAsync: async ({ from, to }: { from: string; to: string }) => {
    mockFiles.set(to, mockFiles.get(from)!);
    mockFiles.delete(from);
  },
  writeAsStringAsync: async (uri: string, text: string) => {
    mockFiles.set(uri, { size: text.length, text });
  },
  readAsStringAsync: async (uri: string) => mockFiles.get(uri)!.text,
  createDownloadResumable: (...args: Parameters<typeof mockCreateDownload>) =>
    mockCreateDownload(...args),
}));
jest.mock('../fileHash', () => ({
  hashLocalFile: async (uri: string, signal: AbortSignal) => {
    signal.throwIfAborted();
    return mockInvalidDigest ? 'wrong-digest' : mockFiles.get(uri)?.digest;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.clear();
  mockHoldTransfer = false;
  mockInvalidDigest = false;
});

function observe(model: ReturnType<typeof createOcrModelDownload>) {
  const states: LocalOcrModelState[] = [];
  const stop = model.observe((state) => states.push(state));
  return { states, stop };
}

test('download during startup inspection installs both files before reporting ready', async () => {
  const model = createOcrModelDownload(true);
  const { states, stop } = observe(model);
  await model.download();
  expect(mockCreateDownload).toHaveBeenCalledTimes(2);
  expect(states.at(-1)).toMatchObject({ status: 'ready', receivedBytes: LOCAL_OCR_MODEL_BYTES });
  expect(await model.ensureReady()).toBe(true);
  expect([...mockFiles.keys()].filter((path) => path.endsWith('.gguf'))).toHaveLength(2);
  stop();
  await model.dispose();
});

test('bad downloaded checksums never become a usable model', async () => {
  mockInvalidDigest = true;
  const model = createOcrModelDownload(true);
  const { states } = observe(model);
  await model.download();
  expect(await model.ensureReady()).toBe(false);
  expect(states.at(-1)).toMatchObject({ status: 'failed', reason: 'verification' });
  expect(states.some((state) => state.status === 'ready')).toBe(false);
  expect([...mockFiles.keys()].some((path) => path.endsWith('.gguf'))).toBe(false);
  await model.dispose();
});

test('a new runtime verifies existing bytes rather than trusting file presence', async () => {
  const first = createOcrModelDownload(true);
  await first.download();
  await first.dispose();
  mockInvalidDigest = true;
  const second = createOcrModelDownload(true);
  expect(await second.ensureReady()).toBe(false);
  expect([...mockFiles.keys()].some((path) => path.endsWith('.gguf'))).toBe(false);
  await second.dispose();
});

test('pause persists the native resume token and a later runtime resumes that file', async () => {
  const first = createOcrModelDownload(true);
  let started!: () => void;
  const starting = new Promise<void>((resolve) => {
    started = resolve;
  });
  first.observe((state) => {
    if (state.status === 'downloading') started();
  });
  mockHoldTransfer = true;
  const downloading = first.download();
  await starting;
  await first.pause();
  await downloading;
  expect([...mockFiles.keys()].some((path) => path.endsWith('.resume'))).toBe(true);
  await first.dispose();

  mockHoldTransfer = false;
  const second = createOcrModelDownload(true);
  const { states } = observe(second);
  await second.download();
  expect(mockResume).toHaveBeenCalledWith('native-resume-token');
  expect(states.at(-1)?.status).toBe('ready');
  await second.remove();
  expect(mockFiles.size).toBe(0);
  expect(await second.ensureReady()).toBe(false);
  await second.dispose();
});

test('an unavailable native runtime does not download model files', async () => {
  const model = createOcrModelDownload(false);
  const { states } = observe(model);
  await model.download();
  expect(states.at(-1)).toMatchObject({ status: 'failed', reason: 'unavailable' });
  expect(mockCreateDownload).not.toHaveBeenCalled();
  await model.dispose();
});

test('pausing startup inspection does not prevent a subsequent download from pausing', async () => {
  const model = createOcrModelDownload(true);
  const checking = model.ensureReady();
  await model.pause();
  expect(await checking).toBe(false);

  mockHoldTransfer = true;
  let started!: () => void;
  const starting = new Promise<void>((resolve) => {
    started = resolve;
  });
  const { states, stop } = observe(model);
  const stopStarting = model.observe((state) => {
    if (state.status === 'downloading') started();
  });
  const downloading = model.download();
  await starting;
  await model.pause();
  expect(await downloading).toBe(false);
  expect(states.at(-1)?.status).toBe('paused');
  expect([...mockFiles.keys()].some((path) => path.endsWith('.resume'))).toBe(true);
  stopStarting();
  stop();
  await model.dispose();
});
