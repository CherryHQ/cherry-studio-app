import type { PaintingsBackend } from '@/shared/contracts';
import type { FileEntryId, PreparedInternalFile } from '@cherrystudio/shared/data/types/file';
import { createUniqueModelId } from '@cherrystudio/shared/data/types/model';
import type { Painting } from '@cherrystudio/shared/data/types/painting';
import { PaintingsService, type PaintingsServiceDependencies } from '../PaintingsService';

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
  } satisfies PaintingsServiceDependencies['files'];
  const dependencies: PaintingsServiceDependencies = {
    ai: {
      generateImage: jest.fn(async () => ({
        images: [{ base64: 'aW1hZ2U=', mediaType: 'image/png' }],
      })),
    },
    files,
    paintings: {
      create: jest.fn(async () => receipt),
      get: jest.fn(async () => completed),
      listIds: jest.fn(async () => [completed.id]),
      listPage: jest.fn(async () => ({ items: [completed] })),
      removeMany: jest.fn(async () => undefined),
      replaceOutputs: jest.fn(async () => completed),
    },
    storage: {
      discard: jest.fn(),
      prepareGeneratedImage: jest.fn(() => prepared(outputFileId, 'file:///output.png')),
      prepareInput: jest.fn(async () => prepared(inputFileId, 'file:///input.png')),
      readDataUrl: jest.fn(async () => 'data:image/png;base64,aW1hZ2U='),
    },
  };
  const backend: PaintingsBackend = new PaintingsService(dependencies);
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

describe('PaintingsService', () => {
  it('persists prepared inputs and generated outputs behind one session call', async () => {
    const { backend, dependencies } = createSubject();
    const session = backend.createGenerationSession();

    await expect(session.generate(generationInput, new AbortController().signal)).resolves.toEqual({
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

    await expect(session.generate(generationInput, new AbortController().signal)).rejects.toThrow(
      'provider failed',
    );
    await session.generate(generationInput, new AbortController().signal);

    expect(dependencies.paintings.create).toHaveBeenCalledTimes(1);
  });

  it('discards prepared inputs when receipt persistence fails', async () => {
    const { backend, dependencies } = createSubject();
    jest.mocked(dependencies.paintings.create).mockRejectedValue(new Error('database failed'));
    const session = backend.createGenerationSession();

    await expect(session.generate(generationInput, new AbortController().signal)).rejects.toThrow(
      'database failed',
    );
    expect(dependencies.storage.discard).toHaveBeenCalledWith([
      expect.objectContaining({ id: inputFileId }),
    ]);
  });
});
