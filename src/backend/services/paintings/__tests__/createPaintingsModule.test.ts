import type { Database } from '@/backend/data/db/DbService';
import type { PaintingsModule } from '@/shared/contracts';
import { type FileEntry, type FileEntryId, FileEntrySchema } from '@/shared/data/types/file';
import { createUniqueModelId } from '@/shared/data/types/model';
import type { Painting } from '@/shared/data/types/painting';

import { createPaintingsModule, type PaintingsModuleDependencies } from '../createPaintingsModule';

const modelId = createUniqueModelId('openai', 'image-1');
const inputFileId = '00000000-0000-4000-8000-000000000001' as FileEntryId;
const existingFileId = '00000000-0000-4000-8000-000000000003' as FileEntryId;
const tx = { sentinel: 'tx' } as unknown as Database;

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

function fileEntry(id: FileEntryId): FileEntry {
  return FileEntrySchema.parse({
    createdAt: 1,
    filename: 'image.png',
    id,
    mediaType: 'image/png',
    provenance: 'imported',
    size: 1,
    updatedAt: 1,
  });
}

function createSubject() {
  const dependencies: PaintingsModuleDependencies = {
    db: {
      withWriteTx: jest.fn(async (fn) => fn(tx)),
    },
    files: {
      resolve: jest.fn(),
    },
    jobs: {
      cancelGenerate: jest.fn(async () => undefined),
      enqueueGenerateTx: jest.fn(async () => ({ id: 'job-1' })),
      findActiveGenerateTx: jest.fn(async () => null),
    },
    paintings: {
      createTx: jest.fn(async () => painting('painting-1')),
      resetForRetryTx: jest.fn(async (_tx: Database, id: string) => painting(id)),
    },
    storage: {
      createInternalEntry: jest.fn(async () => fileEntry(inputFileId)),
      discard: jest.fn(async () => undefined),
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
  modelName: 'GPT Image 2',
  paramValues: {},
  prompt: ' draw ',
};

function signatureFor(paintingId: string | null = null) {
  return JSON.stringify({
    images: ['draft-1:file:///picked.png'],
    mode: 'generate',
    modelId,
    paintingId,
    paramValues: {},
    prompt: 'draw',
  });
}

const expectedSignature = signatureFor();

describe('createPaintingsModule', () => {
  it('creates the receipt and enqueues the job atomically inside one transaction', async () => {
    const { backend, dependencies } = createSubject();

    await expect(backend.startGeneration(generationInput)).resolves.toEqual({
      jobId: 'job-1',
      paintingId: 'painting-1',
    });

    // Exact call shape: the media type rides along and no cleanup policy exists.
    expect(dependencies.storage.createInternalEntry).toHaveBeenCalledWith({
      mediaType: 'image/png',
      name: 'input.png',
      provenance: 'imported',
      source: 'uri',
      uri: 'file:///picked.png',
    });
    expect(dependencies.paintings.createTx).toHaveBeenCalledWith(tx, {
      inputFileIds: [inputFileId],
      modelId,
      prompt: 'draw',
      providerId: 'openai',
    });
    expect(dependencies.jobs.enqueueGenerateTx).toHaveBeenCalledWith(
      tx,
      {
        images: [{ fileEntryId: inputFileId, mediaType: 'image/png', uri: 'file:///picked.png' }],
        mode: 'generate',
        modelId,
        modelName: 'GPT Image 2',
        paintingId: 'painting-1',
        paramValues: {},
        prompt: 'draw',
      },
      { idempotencyKey: expectedSignature },
    );
    expect(dependencies.storage.discard).not.toHaveBeenCalled();
  });

  it('passes through images that already have a file entry without re-creating them', async () => {
    const { backend, dependencies } = createSubject();

    await backend.startGeneration({
      ...generationInput,
      images: [
        {
          fileEntryId: existingFileId,
          id: 'attachment-1',
          mediaType: 'image/png',
          name: 'existing.png',
          uri: 'file:///existing.png',
        },
      ],
    });

    expect(dependencies.storage.createInternalEntry).not.toHaveBeenCalled();
    expect(dependencies.paintings.createTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ inputFileIds: [existingFileId] }),
    );
  });

  it('returns the active job on an idempotency hit and discards its fresh inputs', async () => {
    const { backend, dependencies } = createSubject();
    jest
      .mocked(dependencies.jobs.findActiveGenerateTx)
      .mockResolvedValue({ id: 'job-9', input: { paintingId: 'painting-9' } });

    await expect(backend.startGeneration(generationInput)).resolves.toEqual({
      jobId: 'job-9',
      paintingId: 'painting-9',
    });

    expect(dependencies.jobs.findActiveGenerateTx).toHaveBeenCalledWith(tx, expectedSignature);
    expect(dependencies.paintings.createTx).not.toHaveBeenCalled();
    expect(dependencies.jobs.enqueueGenerateTx).not.toHaveBeenCalled();
    expect(dependencies.storage.discard).toHaveBeenCalledWith([
      expect.objectContaining({ id: inputFileId }),
    ]);
  });

  it('reuses the interrupted receipt when a paintingId is supplied instead of minting a new one', async () => {
    const { backend, dependencies } = createSubject();

    await expect(
      backend.startGeneration({ ...generationInput, paintingId: 'painting-7' }),
    ).resolves.toEqual({ jobId: 'job-1', paintingId: 'painting-7' });

    expect(dependencies.paintings.createTx).not.toHaveBeenCalled();
    expect(dependencies.paintings.resetForRetryTx).toHaveBeenCalledWith(tx, 'painting-7', {
      inputFileIds: [inputFileId],
      modelId,
      prompt: 'draw',
      providerId: 'openai',
    });
    expect(dependencies.jobs.enqueueGenerateTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ paintingId: 'painting-7' }),
      { idempotencyKey: signatureFor('painting-7') },
    );
  });

  it('keeps a retry and a fresh generation on distinct idempotency keys', async () => {
    const { backend, dependencies } = createSubject();

    await backend.startGeneration(generationInput);
    await backend.startGeneration({ ...generationInput, paintingId: 'painting-7' });

    const keys = jest
      .mocked(dependencies.jobs.findActiveGenerateTx)
      .mock.calls.map(([, idempotencyKey]) => idempotencyKey);
    expect(new Set(keys).size).toBe(2);
  });

  it('discards created inputs when receipt persistence fails', async () => {
    const { backend, dependencies } = createSubject();
    jest.mocked(dependencies.paintings.createTx).mockRejectedValue(new Error('database failed'));

    await expect(backend.startGeneration(generationInput)).rejects.toThrow('database failed');
    expect(dependencies.storage.discard).toHaveBeenCalledWith([
      expect.objectContaining({ id: inputFileId }),
    ]);
  });

  it('discards created inputs when the enqueue fails', async () => {
    const { backend, dependencies } = createSubject();
    jest.mocked(dependencies.jobs.enqueueGenerateTx).mockRejectedValue(new Error('enqueue failed'));

    await expect(backend.startGeneration(generationInput)).rejects.toThrow('enqueue failed');
    expect(dependencies.storage.discard).toHaveBeenCalledWith([
      expect.objectContaining({ id: inputFileId }),
    ]);
  });

  it('delegates cancellation to the job port', async () => {
    const { backend, dependencies } = createSubject();

    await backend.cancelGeneration('job-1');

    expect(dependencies.jobs.cancelGenerate).toHaveBeenCalledWith('job-1');
  });
});
