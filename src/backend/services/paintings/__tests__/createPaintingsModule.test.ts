import type { FileEntryId, InternalFileEntry } from '@cherrystudio/universal/data/types/file';
import { createUniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Painting } from '@cherrystudio/universal/data/types/painting';

import type { Database } from '@/backend/data/db/DbService';
import type { PaintingsModule } from '@/shared/contracts';

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

function internalEntry(id: FileEntryId): InternalFileEntry {
  return {
    cleanupPolicy: 'delete_when_unreferenced',
    contentHash: null,
    createdAt: 1,
    ext: 'png',
    id,
    name: 'image',
    origin: 'internal',
    size: 1,
    updatedAt: 1,
  };
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
    },
    storage: {
      createInternalEntry: jest.fn(async () => internalEntry(inputFileId)),
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
  paramValues: {},
  prompt: ' draw ',
};

const expectedSignature = JSON.stringify({
  images: ['draft-1:file:///picked.png'],
  mode: 'generate',
  modelId,
  paramValues: {},
  prompt: 'draw',
});

describe('createPaintingsModule', () => {
  it('creates the receipt and enqueues the job atomically inside one transaction', async () => {
    const { backend, dependencies } = createSubject();

    await expect(backend.startGeneration(generationInput)).resolves.toEqual({ jobId: 'job-1' });

    expect(dependencies.storage.createInternalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        cleanupPolicy: 'delete_when_unreferenced',
        source: 'uri',
        uri: 'file:///picked.png',
      }),
    );
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
    jest.mocked(dependencies.jobs.findActiveGenerateTx).mockResolvedValue({ id: 'job-9' });

    await expect(backend.startGeneration(generationInput)).resolves.toEqual({ jobId: 'job-9' });

    expect(dependencies.jobs.findActiveGenerateTx).toHaveBeenCalledWith(tx, expectedSignature);
    expect(dependencies.paintings.createTx).not.toHaveBeenCalled();
    expect(dependencies.jobs.enqueueGenerateTx).not.toHaveBeenCalled();
    expect(dependencies.storage.discard).toHaveBeenCalledWith([
      expect.objectContaining({ id: inputFileId }),
    ]);
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
