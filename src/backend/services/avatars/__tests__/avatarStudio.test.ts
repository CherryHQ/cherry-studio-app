import { createUniqueModelId } from '@/shared/data/types/model';

import { createAvatarStudio } from '../avatarStudio';

const mockFiles = new Map<string, string | Uint8Array>();
let mockId = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => `00000000-0000-4000-8000-${String(++mockId).padStart(12, '0')}`,
}));
jest.mock('@/backend/data/storage/storagePaths', () => ({
  storageDirectory: () => 'file:///documents',
}));
jest.mock('expo-file-system', () => {
  const path = (parts: (string | { uri: string })[]) =>
    parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  return {
    File: class {
      uri: string;
      constructor(...parts: (string | { uri: string })[]) {
        this.uri = path(parts);
      }
      get exists() {
        return mockFiles.has(this.uri);
      }
      create() {
        mockFiles.set(this.uri, '');
      }
      write(value: string | Uint8Array) {
        mockFiles.set(this.uri, value);
      }
      async text() {
        return mockFiles.get(this.uri);
      }
      async bytes() {
        return mockFiles.get(this.uri);
      }
      delete() {
        mockFiles.delete(this.uri);
      }
    },
    Directory: class {
      uri: string;
      constructor(...parts: (string | { uri: string })[]) {
        this.uri = path(parts);
      }
      create() {}
      delete() {
        for (const key of mockFiles.keys())
          if (key.startsWith(this.uri + '/')) mockFiles.delete(key);
      }
    },
  };
});
jest.mock('@/backend/services/file/rgbaImageCodec', () => ({
  decodeRgba: () => ({ width: 1, height: 1, data: new Uint8Array([255, 128, 0, 255]) }),
  encodePng: () => new Uint8Array([1, 2, 3]),
}));
// Pixel-quality behavior is exercised separately with real RGBA buffers.
jest.mock('../avatarStudioQuality', () => ({
  validateAvatarBase: jest.fn(),
  validateAvatarExpression: jest.fn(),
}));

const modelId = createUniqueModelId('provider', 'image-model');
const input = { name: 'Cat', prompt: 'Orange chibi cat', modelId, keyColor: 'green' as const };
const result = { images: [{ base64: 'AQID', mediaType: 'image/png' }] };

function setup(edit = true) {
  const generateImage = jest.fn(async () => result);
  const saveCharacter = jest.fn(async () => '00000000-0000-4000-8000-999999999999');
  const deps = {
    ai: { generateImage },
    models: {
      getById: jest.fn(
        async () =>
          ({
            imageGeneration: {
              modes: { generate: { supports: {} }, ...(edit ? { edit: { supports: {} } } : {}) },
            },
          }) as never,
      ),
    },
    normalizeError: (error: unknown) => ({
      code: 'runtime_error',
      message: String(error),
      retryable: false,
    }),
    characters: { saveCharacter, removeCharacter: jest.fn(async () => undefined) },
  };
  return { studio: createAvatarStudio(deps), deps, generateImage, saveCharacter };
}

beforeEach(() => {
  mockFiles.clear();
  mockId = 0;
});

test('preflight refuses a generation-only model without creating a draft or spending quota', async () => {
  const { studio, generateImage } = setup(false);
  await expect(studio.start(input)).rejects.toThrow('avatar_model_unsupported');
  expect((await studio.get()).draft).toBeNull();
  expect(generateImage).not.toHaveBeenCalled();
});

test('enforces reference editing and a confirmed sample before the remaining batch', async () => {
  const { studio, generateImage, saveCharacter } = setup();
  await studio.start(input);
  const id = (await studio.get()).draft!.id;
  await studio.generate(id, 'candidates');
  await studio.selectCandidate(id, (await studio.get()).draft!.candidates[0]!.id);
  await expect(studio.generate(id, 'expressions')).rejects.toThrow('avatar_confirm_sample');
  expect(generateImage).toHaveBeenCalledTimes(2);
  await studio.generate(id, 'sample');
  expect(generateImage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      mode: 'edit',
      inputImages: ['data:image/png;base64,AQID'],
      uniqueModelId: modelId,
    }),
  );
  await expect(studio.save(id)).rejects.toThrow('avatar_incomplete');
  await studio.confirmSample(id);
  await studio.generate(id, 'expressions');
  expect(generateImage).toHaveBeenCalledTimes(7);
  await studio.generate(id, 'expressions');
  expect(generateImage).toHaveBeenCalledTimes(7);
  const saved = await studio.save(id);
  expect(await studio.save(id)).toBe(saved);
  expect(saveCharacter).toHaveBeenCalledTimes(1);
});

test('reopens partial progress and retries only missing images after a provider failure', async () => {
  const { studio, deps, generateImage } = setup();
  await studio.start(input);
  const id = (await studio.get()).draft!.id;
  generateImage.mockResolvedValueOnce(result).mockRejectedValueOnce(new Error('network offline'));
  await expect(studio.generate(id, 'candidates')).rejects.toThrow('network offline');
  const restored = createAvatarStudio(deps);
  expect((await restored.get()).draft!.candidates).toHaveLength(1);
  expect((await restored.get()).draft!.error?.diagnosticId).toBeDefined();
  await restored.generate(id, 'candidates');
  expect(generateImage).toHaveBeenCalledTimes(3);
  expect((await restored.get()).draft!.candidates).toHaveLength(2);
});

test('cancel aborts the owned request and blocks duplicate or destructive operations while active', async () => {
  const { studio, generateImage } = setup();
  await studio.start(input);
  const id = (await studio.get()).draft!.id;
  let started!: () => void;
  const start = new Promise<void>((resolve) => {
    started = resolve;
  });
  generateImage.mockImplementationOnce(
    (...args: unknown[]) =>
      new Promise<typeof result>((_, reject) => {
        const request = args[0] as { requestOptions: { signal: AbortSignal } };
        request.requestOptions.signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })),
        );
        started();
      }),
  );
  const work = studio.generate(id, 'candidates');
  const rejected = expect(work).rejects.toThrow('cancelled');
  await start;
  await expect(studio.generate(id, 'candidates')).rejects.toThrow('avatar_busy');
  await expect(studio.discard(id)).rejects.toThrow('avatar_busy');
  studio.cancel();
  await rejected;
  expect((await studio.get()).active).toBeNull();
  expect((await studio.get()).draft?.error).toBeUndefined();
});
