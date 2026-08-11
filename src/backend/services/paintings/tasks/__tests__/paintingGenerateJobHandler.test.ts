import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import type { FileEntryId, InternalFileEntry } from '@cherrystudio/universal/data/types/file';
import { createUniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Painting } from '@cherrystudio/universal/data/types/painting';
import { loggerService } from '@logger';

import { uninstallTestHost } from '@/backend/core/application/testHost';
import { createTestRuntime, type TestRuntime } from '@/backend/services/jobs/__tests__/_helpers';
import { jobHandlerEntry } from '@/backend/services/jobs/JobRuntime';
import type { JobContext } from '@/backend/services/jobs/types';

import {
  createPaintingGenerateJobHandler,
  type PaintingGenerateJobDependencies,
  type PaintingGenerateJobInput,
} from '../paintingGenerateJobHandler';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

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

function createDependencies(): PaintingGenerateJobDependencies {
  return {
    ai: {
      generateImage: jest.fn(async () => ({
        images: [{ base64: 'aW1hZ2U=', mediaType: 'image/png' }],
      })),
    },
    paintings: {
      replaceOutputs: jest.fn(async () => painting('painting-1', [outputFileId])),
    },
    storage: {
      createInternalEntry: jest.fn(async () => internalEntry(outputFileId)),
      discard: jest.fn(async () => undefined),
      getUri: jest.fn(() => 'file:///output.png'),
      readDataUrl: jest.fn(async () => 'data:image/png;base64,aW1hZ2U='),
    },
  };
}

const jobInput: PaintingGenerateJobInput = {
  images: [{ fileEntryId: inputFileId, mediaType: 'image/png', uri: 'file:///picked.png' }],
  mode: 'generate',
  modelId,
  paintingId: 'painting-1',
  paramValues: {},
  prompt: 'draw',
};

function createContext(
  overrides: Partial<JobContext<PaintingGenerateJobInput>> = {},
): JobContext<PaintingGenerateJobInput> {
  return {
    attempt: 0,
    input: jobInput,
    jobId: 'job-1',
    logger: loggerService.withContext('PaintingGenerateTest'),
    metadata: {},
    parentId: null,
    patchMetadata: async () => undefined,
    reportProgress: () => undefined,
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe('createPaintingGenerateJobHandler', () => {
  it('generates, persists outputs onto the receipt, and returns the result', async () => {
    const dependencies = createDependencies();
    const handler = createPaintingGenerateJobHandler(dependencies);

    await expect(handler.execute(createContext())).resolves.toEqual({
      outputs: [{ fileEntryId: outputFileId, uri: 'file:///output.png' }],
      painting: painting('painting-1', [outputFileId]),
    });

    expect(dependencies.storage.readDataUrl).toHaveBeenCalledWith(
      'file:///picked.png',
      'image/png',
    );
    expect(dependencies.ai.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        inputImages: ['data:image/png;base64,aW1hZ2U='],
        prompt: 'draw',
        uniqueModelId: modelId,
      }),
    );
    expect(dependencies.paintings.replaceOutputs).toHaveBeenCalledWith('painting-1', [
      outputFileId,
    ]);
  });

  it('fails when the provider returns no image', async () => {
    const dependencies = createDependencies();
    jest.mocked(dependencies.ai.generateImage).mockResolvedValue({ images: [] });
    const handler = createPaintingGenerateJobHandler(dependencies);

    await expect(handler.execute(createContext())).rejects.toThrow(
      'Image provider returned no image',
    );
  });

  it('discards created outputs when output reference persistence fails', async () => {
    const dependencies = createDependencies();
    jest
      .mocked(dependencies.paintings.replaceOutputs)
      .mockRejectedValue(new Error('database failed'));
    const handler = createPaintingGenerateJobHandler(dependencies);

    await expect(handler.execute(createContext())).rejects.toThrow('database failed');
    expect(dependencies.storage.discard).toHaveBeenCalledWith([
      expect.objectContaining({ id: outputFileId }),
    ]);
  });

  it('keeps referenced outputs when their URI cannot be resolved', async () => {
    const dependencies = createDependencies();
    jest.mocked(dependencies.storage.getUri).mockReturnValue(undefined);
    const handler = createPaintingGenerateJobHandler(dependencies);

    await expect(handler.execute(createContext())).rejects.toThrow(
      `Generated painting file is unavailable: ${outputFileId}`,
    );
    expect(dependencies.storage.discard).not.toHaveBeenCalled();
  });

  it('rethrows the abort reason instead of generating once the signal fires', async () => {
    const dependencies = createDependencies();
    const controller = new AbortController();
    controller.abort(new Error('Job cancelled: user'));
    const handler = createPaintingGenerateJobHandler(dependencies);

    await expect(handler.execute(createContext({ signal: controller.signal }))).rejects.toThrow(
      'Job cancelled: user',
    );
    expect(dependencies.ai.generateImage).not.toHaveBeenCalled();
  });

  describe('through the job runtime', () => {
    let sqlite: DatabaseSync | undefined;
    let ctx: TestRuntime | undefined;

    afterEach(async () => {
      await ctx?.runtime.dispose();
      await uninstallTestHost();
      sqlite?.close();
      ctx = undefined;
      sqlite = undefined;
    });

    it('completes an enqueued painting.generate job with the generation result', async () => {
      const dependencies = createDependencies();
      sqlite = new DatabaseSync(':memory:');
      ctx = await createTestRuntime(sqlite, [
        jobHandlerEntry('painting.generate', createPaintingGenerateJobHandler(dependencies)),
      ]);

      const handle = await ctx.runtime.enqueue('painting.generate', jobInput, {
        idempotencyKey: 'signature-1',
      });
      const snapshot = await handle.finished;

      expect(snapshot.status).toBe('completed');
      expect(snapshot.queue).toBe('painting');
      expect(snapshot.output).toEqual({
        outputs: [{ fileEntryId: outputFileId, uri: 'file:///output.png' }],
        painting: painting('painting-1', [outputFileId]),
      });
    });
  });
});
