import type { Database } from '@/backend/data/db/DbService';
import type { PaintingsModule } from '@/shared/contracts';
import { FileAttachmentError } from '@/shared/contracts/fileAttachment';
import { type FileEntry, type FileEntryId, FileEntrySchema } from '@/shared/data/types/file';
import type { Model } from '@/shared/data/types/model';
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
      prepareAttachments: jest.fn(async ({ fileEntryIds }) =>
        fileEntryIds.map((id) => ({
          entry: fileEntry(id),
          uri: 'file:///managed.png',
          report: { mode: 'image' as const, sourceTruncated: false, requestTruncated: false },
        })),
      ),
    },
    getModel: jest.fn(
      async () =>
        ({
          id: modelId,
          imageGeneration: { modes: { edit: { maxInputImages: 2, supports: {} } } },
        }) as Model,
    ),
    jobs: {
      cancelGenerate: jest.fn(async () => undefined),
      enqueueGenerateTx: jest.fn(async () => ({ id: 'job-1' })),
      findActiveGenerateTx: jest.fn(async () => null),
    },
    paintings: {
      createTx: jest.fn(async () => painting('painting-1')),
      resetForRetryTx: jest.fn(async (_tx: Database, id: string) => painting(id)),
    },
  };
  const backend: PaintingsModule = createPaintingsModule(dependencies);
  return { backend, dependencies };
}

const generationInput = {
  fileEntryIds: [inputFileId],
  mode: 'edit' as const,
  modelId,
  modelName: 'GPT Image 2',
  paramValues: {},
  prompt: ' draw ',
};

function signatureFor(paintingId: string | null = null) {
  return JSON.stringify({
    images: [inputFileId],
    mode: 'edit',
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

    expect(dependencies.paintings.createTx).toHaveBeenCalledWith(tx, {
      inputFileIds: [inputFileId],
      modelId,
      prompt: 'draw',
      providerId: 'openai',
    });
    expect(dependencies.jobs.enqueueGenerateTx).toHaveBeenCalledWith(
      tx,
      {
        images: [{ fileEntryId: inputFileId, mediaType: 'image/png', uri: 'file:///managed.png' }],
        mode: 'edit',
        modelId,
        modelName: 'GPT Image 2',
        paintingId: 'painting-1',
        paramValues: {},
        prompt: 'draw',
      },
      { idempotencyKey: expectedSignature },
    );
  });

  it('passes through images that already have a file entry without re-creating them', async () => {
    const { backend, dependencies } = createSubject();

    await backend.startGeneration({
      ...generationInput,
      fileEntryIds: [existingFileId],
    });

    expect(dependencies.paintings.createTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ inputFileIds: [existingFileId] }),
    );
  });

  it('returns the active job on an idempotency hit without creating another receipt', async () => {
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

  it('propagates a receipt failure without enqueueing a job', async () => {
    const { backend, dependencies } = createSubject();
    jest.mocked(dependencies.paintings.createTx).mockRejectedValue(new Error('database failed'));

    await expect(backend.startGeneration(generationInput)).rejects.toThrow('database failed');
    expect(dependencies.jobs.enqueueGenerateTx).not.toHaveBeenCalled();
  });

  it('propagates an enqueue failure out of the transaction', async () => {
    const { backend, dependencies } = createSubject();
    jest.mocked(dependencies.jobs.enqueueGenerateTx).mockRejectedValue(new Error('enqueue failed'));

    await expect(backend.startGeneration(generationInput)).rejects.toThrow('enqueue failed');
  });

  it('rejects an unavailable library reference before opening a write transaction', async () => {
    const { backend, dependencies } = createSubject();
    jest
      .mocked(dependencies.files.prepareAttachments)
      .mockRejectedValue(
        new FileAttachmentError({ code: 'unavailable', fileEntryId: inputFileId }),
      );
    await expect(backend.startGeneration(generationInput)).rejects.toMatchObject({
      issue: { code: 'unavailable' },
    });
    expect(dependencies.db.withWriteTx).not.toHaveBeenCalled();
  });

  it('uses stored model capabilities and passes the authoritative reference limit', async () => {
    const { backend, dependencies } = createSubject();
    await backend.startGeneration(generationInput);
    expect(dependencies.files.prepareAttachments).toHaveBeenCalledWith({
      fileEntryIds: [inputFileId],
      target: { purpose: 'painting', acceptsImages: true, maxImages: 2 },
    });
    jest.mocked(dependencies.getModel).mockResolvedValue(null);
    await expect(backend.startGeneration(generationInput)).rejects.toMatchObject({
      issue: { code: 'model-unsupported' },
    });
    expect(dependencies.db.withWriteTx).toHaveBeenCalledTimes(1);
  });

  it('enqueues reference-image generation with the generate mode and its own image limit', async () => {
    const { backend, dependencies } = createSubject();
    jest.mocked(dependencies.getModel).mockResolvedValue({
      id: modelId,
      inputModalities: ['text', 'image'],
      imageGeneration: { modes: { generate: { maxInputImages: 3, supports: {} } } },
    } as Model);

    await backend.startGeneration({ ...generationInput, mode: 'generate' });

    expect(dependencies.files.prepareAttachments).toHaveBeenCalledWith({
      fileEntryIds: [inputFileId],
      target: { purpose: 'painting', acceptsImages: true, maxImages: 3 },
    });
    expect(dependencies.jobs.enqueueGenerateTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        mode: 'generate',
        images: [{ fileEntryId: inputFileId, mediaType: 'image/png', uri: 'file:///managed.png' }],
      }),
      expect.anything(),
    );
  });

  it('rejects a stale mode before creating a painting receipt', async () => {
    const { backend, dependencies } = createSubject();
    await expect(
      backend.startGeneration({ ...generationInput, mode: 'generate' }),
    ).rejects.toMatchObject({
      issue: { code: 'model-unsupported' },
    });
    expect(dependencies.db.withWriteTx).not.toHaveBeenCalled();
  });

  it('delegates cancellation to the job port', async () => {
    const { backend, dependencies } = createSubject();

    await backend.cancelGeneration('job-1');

    expect(dependencies.jobs.cancelGenerate).toHaveBeenCalledWith('job-1');
  });
});
