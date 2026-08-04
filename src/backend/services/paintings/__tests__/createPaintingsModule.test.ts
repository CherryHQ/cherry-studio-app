import type { FileEntryId } from '@cherrystudio/universal/data/types/file';
import { createUniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Painting } from '@cherrystudio/universal/data/types/painting';

import type { PreparedInternalFile } from '@/backend/types/file';
import type { PaintingsModule } from '@/shared/contracts';

import { createPaintingsModule, type PaintingsModuleDependencies } from '../createPaintingsModule';

const modelId = createUniqueModelId('openai', 'image-1');
const inputFileId = '00000000-0000-4000-8000-000000000001' as FileEntryId;
const outputFileId = '00000000-0000-4000-8000-000000000002' as FileEntryId;

function painting(id: string, outputs: FileEntryId[] = []): Painting {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    files: { input: [inputFileId], output: outputs },
    id,
    modelId,
    orderKey: id,
    prompt: 'draw',
    providerId: 'openai',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function prepared(id: FileEntryId, uri: string): PreparedInternalFile {
  return { ext: 'png', id, name: 'image', size: 1, uri };
}

function createSubject() {
  const receipt = painting('painting-1');
  const completed = painting('painting-1', [outputFileId]);
  const files = {
    resolve: jest.fn(),
  } satisfies PaintingsModuleDependencies['files'];
  const dependencies: PaintingsModuleDependencies = {
    ai: {
      generateImage: jest.fn(async () => ({
        images: [{ base64: 'aW1hZ2U=', mediaType: 'image/png' }],
      })),
    },
    files,
    paintings: {
      create: jest.fn(async () => receipt),
      replaceOutputs: jest.fn(async () => completed),
    },
    storage: {
      discard: jest.fn(),
      prepareGeneratedImage: jest.fn(() => prepared(outputFileId, 'file:///output.png')),
      prepareInput: jest.fn(async () => prepared(inputFileId, 'file:///input.png')),
      readDataUrl: jest.fn(async () => 'data:image/png;base64,aW1hZ2U='),
    },
  };
  const backend: PaintingsModule = createPaintingsModule(dependencies);
  return { backend, dependencies };
}

const generationInput = {
  images: [
    {
      id: 'draft-1',
      mediaType: 'image/png',
      name: 'input.png',
      uri: 'file:///picked.png',
    },
  ],
  mode: 'generate' as const,
  modelId,
  paramValues: {},
  prompt: ' draw ',
};

describe('createPaintingsModule', () => {
  it('persists prepared inputs and generated outputs behind one session call', async () => {
    const { backend, dependencies } = createSubject();
    const session = backend.createGenerationSession();

    await expect(session.generate(generationInput)).resolves.toEqual({
      outputs: [{ fileEntryId: outputFileId, uri: 'file:///output.png' }],
      painting: painting('painting-1', [outputFileId]),
    });
    expect(dependencies.paintings.create).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'draw', providerId: 'openai' }),
    );
    expect(dependencies.ai.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'draw', uniqueModelId: modelId }),
    );
    expect(dependencies.paintings.replaceOutputs).toHaveBeenCalledWith('painting-1', [
      expect.objectContaining({ id: outputFileId }),
    ]);
  });

  it('reuses an incomplete receipt when the same generation is retried', async () => {
    const { backend, dependencies } = createSubject();
    jest
      .mocked(dependencies.ai.generateImage)
      .mockRejectedValueOnce(new Error('provider failed'))
      .mockResolvedValueOnce({ images: [{ base64: 'aW1hZ2U=', mediaType: 'image/png' }] });
    const session = backend.createGenerationSession();

    await expect(session.generate(generationInput)).rejects.toThrow('provider failed');
    await session.generate(generationInput);

    expect(dependencies.paintings.create).toHaveBeenCalledTimes(1);
  });

  it('discards prepared inputs when receipt persistence fails', async () => {
    const { backend, dependencies } = createSubject();
    jest.mocked(dependencies.paintings.create).mockRejectedValue(new Error('database failed'));
    const session = backend.createGenerationSession();

    await expect(session.generate(generationInput)).rejects.toThrow('database failed');
    expect(dependencies.storage.discard).toHaveBeenCalledWith([
      expect.objectContaining({ id: inputFileId }),
    ]);
  });

  it('cancels the active call and reuses its receipt for the same input', async () => {
    const { backend, dependencies } = createSubject();
    let observedSignal: AbortSignal | undefined;
    jest
      .mocked(dependencies.ai.generateImage)
      .mockImplementationOnce(
        ({ requestOptions }) =>
          new Promise((_resolve, reject) => {
            observedSignal = requestOptions.signal;
            requestOptions.signal.addEventListener(
              'abort',
              () => reject(requestOptions.signal.reason),
              {
                once: true,
              },
            );
          }),
      )
      .mockResolvedValueOnce({ images: [{ base64: 'aW1hZ2U=', mediaType: 'image/png' }] });
    const session = backend.createGenerationSession();

    const firstGeneration = session.generate(generationInput);
    await waitUntil(() => observedSignal !== undefined);
    await expect(session.generate(generationInput)).rejects.toThrow(
      'Painting generation is already in progress',
    );
    session.cancel();

    await expect(firstGeneration).rejects.toThrow('Painting generation cancelled');
    expect(observedSignal?.aborted).toBe(true);
    await session.generate(generationInput);
    expect(dependencies.paintings.create).toHaveBeenCalledTimes(1);
  });

  it('keeps incomplete receipts isolated between sessions', async () => {
    const { backend, dependencies } = createSubject();
    jest.mocked(dependencies.ai.generateImage).mockRejectedValue(new Error('provider failed'));
    const firstSession = backend.createGenerationSession();
    const secondSession = backend.createGenerationSession();

    await expect(firstSession.generate(generationInput)).rejects.toThrow('provider failed');
    await expect(secondSession.generate(generationInput)).rejects.toThrow('provider failed');

    expect(dependencies.paintings.create).toHaveBeenCalledTimes(2);
  });

  it('aborts on dispose and permanently rejects later generation', async () => {
    const { backend, dependencies } = createSubject();
    let observedSignal: AbortSignal | undefined;
    jest.mocked(dependencies.ai.generateImage).mockImplementationOnce(
      ({ requestOptions }) =>
        new Promise((_resolve, reject) => {
          observedSignal = requestOptions.signal;
          requestOptions.signal.addEventListener(
            'abort',
            () => reject(requestOptions.signal.reason),
            {
              once: true,
            },
          );
        }),
    );
    const session = backend.createGenerationSession();

    const generation = session.generate(generationInput);
    await waitUntil(() => observedSignal !== undefined);
    session.dispose();

    await expect(generation).rejects.toThrow('Painting generation session is disposed');
    expect(observedSignal?.aborted).toBe(true);
    await expect(session.generate(generationInput)).rejects.toThrow(
      'Painting generation session is disposed',
    );
  });

  it('does not revive a disposed session when receipt creation settles late', async () => {
    const { backend, dependencies } = createSubject();
    const receipt = createDeferred<Painting>();
    jest.mocked(dependencies.paintings.create).mockReturnValueOnce(receipt.promise);
    const session = backend.createGenerationSession();

    const generation = session.generate(generationInput);
    await waitUntil(() => jest.mocked(dependencies.paintings.create).mock.calls.length === 1);
    session.dispose();
    receipt.resolve(painting('painting-late'));

    await expect(generation).rejects.toThrow('Painting generation session is disposed');
    expect(dependencies.ai.generateImage).not.toHaveBeenCalled();
    await expect(session.generate(generationInput)).rejects.toThrow(
      'Painting generation session is disposed',
    );
  });
});

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

async function waitUntil(predicate: () => boolean) {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) {
      return;
    }
    await Promise.resolve();
  }

  throw new Error('Timed out waiting for condition');
}
