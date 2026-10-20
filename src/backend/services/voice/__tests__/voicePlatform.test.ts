import { AudioModule } from 'expo-audio';

import { MAX_VOICE_AUDIO_BYTES } from '@/shared/contracts/voice';

import { createVoicePlatform } from '../voicePlatform';

const mockFiles = new Map<string, { size: number; bytes: Uint8Array }>();
const mockReadBytes = jest.fn();
const mockDelete = jest.fn();
let mockId = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${++mockId}` }));
jest.mock('expo-file-system', () => {
  function uri(parts: { uri: string }[] | (string | { uri: string })[]) {
    return parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  }
  return {
    Paths: { cache: 'file:///cache' },
    Directory: class {
      uri: string;
      exists = true;
      constructor(...parts: (string | { uri: string })[]) {
        this.uri = uri(parts);
      }
      create() {}
      delete() {
        mockDelete(this.uri);
        for (const path of mockFiles.keys())
          if (path.startsWith(`${this.uri}/`)) mockFiles.delete(path);
      }
    },
    File: class {
      uri: string;
      constructor(...parts: (string | { uri: string })[]) {
        this.uri = uri(parts);
      }
      get exists() {
        return mockFiles.has(this.uri);
      }
      get size() {
        return mockFiles.get(this.uri)?.size ?? 0;
      }
      async bytes() {
        mockReadBytes(this.uri);
        return mockFiles.get(this.uri)!.bytes;
      }
      write(bytes: Uint8Array) {
        mockFiles.set(this.uri, { size: bytes.length, bytes });
      }
      delete() {
        mockDelete(this.uri);
        mockFiles.delete(this.uri);
      }
    },
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.clear();
  mockId = 0;
});
function platform() {
  const runWithSystemPrompt = jest.fn();
  return {
    ...createVoicePlatform({
      async runWithSystemPrompt(operation, signal) {
        runWithSystemPrompt(operation, signal);
        signal?.throwIfAborted();
        return operation();
      },
    }),
    runWithSystemPrompt,
  };
}

test('rejects remote, missing, oversized and pre-aborted inputs before reading their bytes', async () => {
  const { storage } = platform();
  const signal = new AbortController().signal;
  await expect(storage.readInput('https://external.invalid/audio', signal)).rejects.toMatchObject({
    code: 'invalid-input',
  });
  await expect(storage.readInput('file:///missing', signal)).rejects.toMatchObject({
    code: 'invalid-input',
  });
  mockFiles.set('file:///large', { size: MAX_VOICE_AUDIO_BYTES + 1, bytes: new Uint8Array([1]) });
  await expect(storage.readInput('file:///large', signal)).rejects.toMatchObject({
    code: 'audio-too-large',
  });
  const controller = new AbortController();
  controller.abort();
  await expect(storage.readInput('file:///large', controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(mockReadBytes).not.toHaveBeenCalled();
});

test('preserves input files and confines output cleanup to this host generation', async () => {
  const first = platform();
  const second = platform();
  const bytes = new Uint8Array([1, 2, 3]);
  mockFiles.set('file:///original.m4a', { size: bytes.length, bytes });
  expect(await first.storage.readInput('file:///original.m4a', new AbortController().signal)).toBe(
    bytes,
  );
  const a = await first.storage.writeOutput(bytes);
  const b = await second.storage.writeOutput(bytes);
  expect(a.uri).toMatch(/\.wav$/);
  expect(a.uri).not.toBe(b.uri);
  await first.storage.dispose();
  expect(mockFiles.has(a.uri)).toBe(false);
  expect(mockFiles.has(b.uri)).toBe(true);
  expect(mockFiles.has('file:///original.m4a')).toBe(true);
  await second.storage.releaseOutput(b);
  expect(mockFiles.has(b.uri)).toBe(false);
});

test.each([
  { granted: true, canAskAgain: true },
  { granted: false, canAskAgain: false },
])('does not reprompt an already decided permission: %j', async (permission) => {
  jest.mocked(AudioModule.getRecordingPermissionsAsync).mockResolvedValueOnce({
    ...permission,
    status: permission.granted ? 'granted' : 'denied',
    expires: 'never',
  } as Awaited<ReturnType<typeof AudioModule.getRecordingPermissionsAsync>>);
  const p = platform();
  const signal = new AbortController().signal;
  expect(await p.requestMicrophoneAccess(signal)).toEqual(permission);
  expect(p.runWithSystemPrompt).toHaveBeenCalledWith(expect.any(Function), signal);
  expect(AudioModule.requestRecordingPermissionsAsync).not.toHaveBeenCalled();
});

test('prompts through the shared permission queue only when asking is allowed', async () => {
  jest.mocked(AudioModule.getRecordingPermissionsAsync).mockResolvedValueOnce({
    granted: false,
    canAskAgain: true,
    status: 'undetermined',
    expires: 'never',
  } as Awaited<ReturnType<typeof AudioModule.getRecordingPermissionsAsync>>);
  jest.mocked(AudioModule.requestRecordingPermissionsAsync).mockResolvedValueOnce({
    granted: true,
    canAskAgain: true,
    status: 'granted',
    expires: 'never',
  } as Awaited<ReturnType<typeof AudioModule.requestRecordingPermissionsAsync>>);
  expect(await platform().requestMicrophoneAccess(new AbortController().signal)).toEqual({
    granted: true,
    canAskAgain: true,
  });
  expect(AudioModule.requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
});
