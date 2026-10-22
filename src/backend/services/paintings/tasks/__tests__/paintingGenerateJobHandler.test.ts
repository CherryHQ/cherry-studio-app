import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { loggerService } from '@logger';
import Constants from 'expo-constants';

import { uninstallTestHost } from '@/backend/core/application/testHost';
import { FileEntryService } from '@/backend/data/services/FileEntryService';
import { FileLibraryService } from '@/backend/data/services/FileLibraryService';
import { createTestRuntime, type TestRuntime } from '@/backend/services/jobs/__tests__/_helpers';
import { jobHandlerEntry } from '@/backend/services/jobs/JobHandlerRegistry';
import type { JobContext } from '@/backend/services/jobs/types';
import { KeepAliveInterruptionError } from '@/backend/services/keepAlive/KeepAliveInterruptionError';
import { AiRequestError } from '@/shared/contracts/aiFailure';
import { FileAttachmentError } from '@/shared/contracts/fileAttachment';
import { type FileEntry, type FileEntryId, FileEntrySchema } from '@/shared/data/types/file';
import { createUniqueModelId } from '@/shared/data/types/model';
import type { Painting } from '@/shared/data/types/painting';

import {
  createPaintingGenerateJobHandler,
  type PaintingGenerateJobDependencies,
  type PaintingGenerateJobInput,
} from '../paintingGenerateJobHandler';

jest.mock('expo-constants', () => ({
  ...jest.requireActual('expo-constants'),
  __esModule: true,
  default: { executionEnvironment: 'bare', expoConfig: { scheme: 'cherrystudio' } },
}));

afterEach(() => {
  Constants.expoConfig!.scheme = 'cherrystudio';
});

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

const modelId = createUniqueModelId('openai', 'image-1');
const inputFileId = '00000000-0000-4000-8000-000000000001' as FileEntryId;
const outputFileId = '00000000-0000-4000-8000-000000000002' as FileEntryId;

function painting(id: string, outputs: FileEntryId[] = []): Painting {
  return {
    boardId: 'board-1',
    brief: null,
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
    provenance: 'generated',
    size: 1,
    updatedAt: 1,
  });
}

function createDependencies(): PaintingGenerateJobDependencies {
  return {
    ai: {
      generateImage: jest.fn(async () => ({
        images: [{ base64: 'aW1hZ2U=', mediaType: 'image/png' }],
      })),
    },
    paintings: {
      getById: jest.fn(async (id) => painting(id)),
      replaceOutputs: jest.fn(async () => painting('painting-1', [outputFileId])),
    },
    storage: {
      createInternalEntry: jest.fn(async () => fileEntry(outputFileId)),
      discard: jest.fn(async () => undefined),
      getUri: jest.fn(() => 'file:///output.png'),
      resolve: jest.fn(async (id) => ({ entry: fileEntry(id), uri: 'file:///picked.png' })),
      readDataUrl: jest.fn(async () => 'data:image/png;base64,aW1hZ2U='),
    },
  };
}

const jobInput: PaintingGenerateJobInput = {
  boardId: 'board-1',
  images: [{ fileEntryId: inputFileId }],
  mode: 'generate',
  modelId,
  modelName: 'GPT Image 2',
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
      outputs: [
        {
          fileEntryId: outputFileId,
          mediaType: 'image/png',
          name: 'image.png',
          size: 1,
          uri: 'file:///output.png',
        },
      ],
      painting: painting('painting-1', [outputFileId]),
    });

    expect(dependencies.storage.readDataUrl).toHaveBeenCalledWith(
      'file:///picked.png',
      'image/png',
      expect.any(AbortSignal),
    );
    expect(dependencies.ai.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        inputImages: ['data:image/png;base64,aW1hZ2U='],
        prompt: 'draw',
        uniqueModelId: modelId,
      }),
    );
    expect(dependencies.storage.createInternalEntry).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'draw.png', provenance: 'generated', source: 'base64' }),
    );
    expect(dependencies.paintings.replaceOutputs).toHaveBeenCalledWith(
      'painting-1',
      [outputFileId],
      expect.any(AbortSignal),
    );
  });

  it('does not read or send an input that became unavailable before execution', async () => {
    const dependencies = createDependencies();
    jest.mocked(dependencies.storage.resolve).mockResolvedValue(null);
    const handler = createPaintingGenerateJobHandler(dependencies);

    await expect(handler.execute(createContext())).rejects.toBeInstanceOf(FileAttachmentError);
    expect(dependencies.storage.readDataUrl).not.toHaveBeenCalled();
    expect(dependencies.ai.generateImage).not.toHaveBeenCalled();
  });

  it('does not execute after the owning receipt was deleted in a previous process', async () => {
    const dependencies = createDependencies();
    jest.mocked(dependencies.paintings.getById).mockRejectedValue(new Error('Painting not found'));
    await expect(
      createPaintingGenerateJobHandler(dependencies).execute(createContext()),
    ).rejects.toThrow('Painting not found');
    expect(dependencies.storage.readDataUrl).not.toHaveBeenCalled();
    expect(dependencies.ai.generateImage).not.toHaveBeenCalled();
  });

  it('preserves safe provider diagnostics in the job failure envelope', async () => {
    const dependencies = createDependencies();
    const failure = {
      version: 1 as const,
      reasonCode: 'network' as const,
      source: { layer: 'provider' as const, name: 'TypeError' },
      context: { providerId: 'openai', modelId: 'image-1' },
    };
    jest
      .mocked(dependencies.ai.generateImage)
      .mockRejectedValue(new AiRequestError({ message: 'fetch failed', retryable: true, failure }));
    const handler = createPaintingGenerateJobHandler(dependencies);
    await expect(handler.execute(createContext())).rejects.toMatchObject({
      error: { message: 'fetch failed', retryable: true, params: { failure } },
    });
    expect(dependencies.storage.createInternalEntry).not.toHaveBeenCalled();
  });

  it('fails when the provider returns no image', async () => {
    const dependencies = createDependencies();
    jest.mocked(dependencies.ai.generateImage).mockResolvedValue({ images: [] });
    const handler = createPaintingGenerateJobHandler(dependencies);

    await expect(handler.execute(createContext())).rejects.toThrow(
      'Image provider returned no image',
    );
  });

  it('discards files that finish saving after the attempt was cancelled instead of replacing retry outputs', async () => {
    const dependencies = createDependencies();
    const controller = new AbortController();
    const timeout = new Error('Job timed out');
    jest.mocked(dependencies.storage.createInternalEntry).mockImplementationOnce(async () => {
      controller.abort(timeout);
      return fileEntry(outputFileId);
    });
    const handler = createPaintingGenerateJobHandler(dependencies);

    await expect(handler.execute(createContext({ signal: controller.signal }))).rejects.toBe(
      timeout,
    );
    expect(dependencies.paintings.replaceOutputs).not.toHaveBeenCalled();
    expect(dependencies.storage.discard).toHaveBeenCalledWith([fileEntry(outputFileId)]);
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

  it('preserves the original persistence error when compensating discard also fails', async () => {
    const dependencies = createDependencies();
    const persistenceError = new Error('database failed');
    jest.mocked(dependencies.paintings.replaceOutputs).mockRejectedValue(persistenceError);
    jest.mocked(dependencies.storage.discard).mockRejectedValue(new Error('discard failed'));
    const handler = createPaintingGenerateJobHandler(dependencies);

    await expect(handler.execute(createContext())).rejects.toBe(persistenceError);
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

  describe('background activity session', () => {
    function createSessionDependencies() {
      const dependencies = createDependencies();
      dependencies.translate = (key) =>
        ({
          'backgroundActivity.cancelled': '已取消',
          'backgroundActivity.completed': '已完成',
          'painting.backgroundActivity.failed': '生成失败',
          'painting.backgroundActivity.title': '绘图',
        })[key] ?? key;
      const sessions: { cancel: jest.Mock; finish: jest.Mock; update: jest.Mock }[] = [];
      const startSession = jest.fn((_input: unknown) => {
        const session = {
          cancel: jest.fn(),
          finish: jest.fn(),
          update: jest.fn(),
        };
        sessions.push(session);
        return session;
      });
      dependencies.activities = { startSession };
      return { dependencies, sessions, startSession };
    }

    it.each(['cherrystudio', 'cherrystudio-dev', 'cherrystudio-preview'])(
      'opens and finishes a painting activity with the current app scheme %s',
      async (scheme) => {
        Constants.expoConfig!.scheme = scheme;
        const { dependencies, sessions, startSession } = createSessionDependencies();
        const handler = createPaintingGenerateJobHandler(dependencies);

        await handler.execute(createContext());

        expect(startSession).toHaveBeenCalledWith(
          expect.objectContaining({
            deepLinkUrl: `${scheme}://paintings?paintingId=painting-1`,
            keepAlive: false,
            props: expect.objectContaining({
              attribution: 'GPT Image 2',
              compactIcon: 'paintbrush',
              icon: 'paintbrush',
              phase: 'generating',
              preview: 'draw',
              title: '绘图',
            }),
            tag: 'painting.generate',
          }),
        );
        const activityInput = startSession.mock.calls[0]?.[0] as { props: unknown } | undefined;
        expect(activityInput?.props).not.toHaveProperty('compactLabel');
        expect(sessions[0]?.finish).toHaveBeenCalledWith(
          expect.objectContaining({
            compactIcon: 'paintbrush',
            compactLabel: '已完成',
            icon: 'check-circle',
            phase: 'completed',
          }),
        );
      },
    );

    it.each(['completed', 'failed'])(
      'keeps execution pending until the %s notification has been delivered',
      async (outcome) => {
        const dependencies = createDependencies();
        if (outcome === 'failed') {
          jest.mocked(dependencies.ai.generateImage).mockRejectedValue(new Error('provider down'));
        }
        let deliver!: () => void;
        const delivery = new Promise<void>((resolve) => {
          deliver = resolve;
        });
        let beginDelivery!: () => void;
        const delivering = new Promise<void>((resolve) => {
          beginDelivery = resolve;
        });
        dependencies.activities = {
          startSession: () => ({
            cancel() {},
            update() {},
            finish() {
              beginDelivery();
              return delivery;
            },
          }),
        };
        const execution = createPaintingGenerateJobHandler(dependencies).execute(createContext());
        const settled = jest.fn();
        void execution.then(settled, settled);
        await delivering;
        await Promise.resolve();
        expect(settled).not.toHaveBeenCalled();
        deliver();
        if (outcome === 'failed') await expect(execution).rejects.toThrow('provider down');
        else await expect(execution).resolves.toHaveProperty('outputs');
      },
    );

    it('finishes the session as failed when generation throws', async () => {
      const { dependencies, sessions } = createSessionDependencies();
      jest.mocked(dependencies.ai.generateImage).mockRejectedValue(new Error('provider down'));
      const handler = createPaintingGenerateJobHandler(dependencies);

      await expect(handler.execute(createContext())).rejects.toThrow('provider down');
      expect(sessions[0]?.finish).toHaveBeenCalledWith(
        expect.objectContaining({
          compactLabel: '生成失败',
          icon: 'warning-triangle',
          phase: 'failed',
        }),
      );
    });

    it('finishes system interruption as failure so the background notification is not suppressed', async () => {
      const { dependencies, sessions } = createSessionDependencies();
      const controller = new AbortController();
      const reason = new KeepAliveInterruptionError('service-stopped');
      controller.abort(reason);
      const handler = createPaintingGenerateJobHandler(dependencies);

      await expect(handler.execute(createContext({ signal: controller.signal }))).rejects.toThrow(
        reason,
      );
      expect(sessions[0]?.finish).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'failed' }),
      );
    });

    it('finishes the session as cancelled when the signal aborted', async () => {
      const { dependencies, sessions } = createSessionDependencies();
      const controller = new AbortController();
      controller.abort(new Error('Job cancelled: user'));
      const handler = createPaintingGenerateJobHandler(dependencies);

      await expect(handler.execute(createContext({ signal: controller.signal }))).rejects.toThrow(
        'Job cancelled: user',
      );
      expect(sessions[0]?.finish).toHaveBeenCalledWith(
        expect.objectContaining({ compactLabel: '已取消', icon: 'x-circle', phase: 'cancelled' }),
      );
    });
  });

  describe('through the job runtime', () => {
    let sqlite: DatabaseSync | undefined;
    let ctx: TestRuntime | undefined;

    afterEach(async () => {
      await ctx?.runtime._doStop();
      await uninstallTestHost();
      sqlite?.close();
      ctx = undefined;
      sqlite = undefined;
    });

    it('rejects a queued child of a sealed board before provider or file I/O', async () => {
      const dependencies = createDependencies();
      sqlite = new DatabaseSync(':memory:');
      ctx = await createTestRuntime(sqlite, [
        jobHandlerEntry('painting.generate', createPaintingGenerateJobHandler(dependencies)),
      ]);
      await ctx.scopes.delete([{ id: jobInput.boardId, kind: 'painting-board' }], async () => {});
      const handle = await ctx.runtime.enqueue('painting.generate', jobInput);
      expect((await handle.finished).status).toBe('cancelled');
      expect(dependencies.ai.generateImage).not.toHaveBeenCalled();
      expect(dependencies.storage.readDataUrl).not.toHaveBeenCalled();
      expect(dependencies.paintings.replaceOutputs).not.toHaveBeenCalled();
    });

    it('rejects an input trashed while its job waits for the painting queue', async () => {
      const dependencies = createDependencies();
      let started!: () => void;
      const firstStarted = new Promise<void>((resolve) => {
        started = resolve;
      });
      let finish!: () => void;
      const firstRunning = new Promise<void>((resolve) => {
        finish = resolve;
      });
      jest.mocked(dependencies.ai.generateImage).mockImplementationOnce(async () => {
        started();
        await firstRunning;
        return { images: [{ base64: 'aW1hZ2U=', mediaType: 'image/png' }] };
      });
      sqlite = new DatabaseSync(':memory:');
      ctx = await createTestRuntime(sqlite, [
        jobHandlerEntry('painting.generate', createPaintingGenerateJobHandler(dependencies)),
      ]);
      const files = new FileEntryService(ctx.db.dbService);
      const library = new FileLibraryService(ctx.db.dbService);
      await files.create({
        id: inputFileId,
        filename: 'input.png',
        mediaType: 'image/png',
        provenance: 'imported',
        size: 1,
      });
      jest.mocked(dependencies.storage.resolve).mockImplementation(async (id) => {
        const entry = await files.findById(id);
        return entry ? { entry, uri: 'file:///retained-input.png' } : null;
      });
      const first = await ctx.runtime.enqueue('painting.generate', {
        ...jobInput,
        images: [],
        paintingId: 'painting-first',
      });
      try {
        await firstStarted;
        const queued = await ctx.runtime.enqueue('painting.generate', jobInput);
        await library.trashFileEntry(inputFileId);
        finish();
        await first.finished;
        expect((await queued.finished).status).toBe('failed');
        expect(dependencies.storage.readDataUrl).not.toHaveBeenCalled();
        expect(dependencies.ai.generateImage).toHaveBeenCalledTimes(1);
      } finally {
        finish();
      }
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
        outputs: [
          {
            fileEntryId: outputFileId,
            mediaType: 'image/png',
            name: 'image.png',
            size: 1,
            uri: 'file:///output.png',
          },
        ],
        painting: painting('painting-1', [outputFileId]),
      });
    });
  });
});
