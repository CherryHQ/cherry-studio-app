import type { ImageGenerationMode, ParamValues } from '@cherrystudio/provider-registry';
import type { FileEntryId, InternalFileEntry } from '@cherrystudio/universal/data/types/file';
import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Painting } from '@cherrystudio/universal/data/types/painting';

import type { JobHandlerFor } from '@/backend/services/jobs/types';
import type { PaintingGenerationResult } from '@/shared/contracts';

import type { CreateInternalEntryInput } from '../../file/fileStorage';

export const PAINTING_GENERATE_JOB_TYPE = 'painting.generate';
export const PAINTING_JOB_QUEUE = 'painting';

/**
 * Input images always carry a fileEntryId: `startGeneration` materializes
 * draft-only images into internal entries before the job is enqueued, and the
 * receipt's painting_file_ref rows pin them for the job's lifetime. The uri is
 * a same-process convenience for readDataUrl — an abandoned job never re-runs
 * (recovery `'abandon'`, maxAttempts 1), so it is never read across restarts.
 */
export type PaintingGenerateJobImage = {
  fileEntryId: FileEntryId;
  mediaType: string;
  uri: string;
};

export type PaintingGenerateJobInput = {
  images: readonly PaintingGenerateJobImage[];
  mode: ImageGenerationMode;
  modelId: UniqueModelId;
  paintingId: string;
  paramValues: ParamValues;
  prompt: string;
};

declare module '@/backend/services/jobs/jobRegistry' {
  interface JobRegistry {
    'painting.generate': PaintingGenerateJobInput;
  }
}

export type PaintingAi = {
  generateImage(input: {
    inputImages: string[];
    mode: ImageGenerationMode;
    paramValues: ParamValues;
    prompt: string;
    requestOptions: { signal: AbortSignal };
    uniqueModelId: UniqueModelId;
  }): Promise<{ images: { base64: string; mediaType: string }[] }>;
};

export type PaintingFileStorage = {
  createInternalEntry(input: CreateInternalEntryInput): Promise<InternalFileEntry>;
  discard(entries: readonly InternalFileEntry[]): Promise<void>;
  readDataUrl(uri: string, mediaType: string): Promise<string>;
  getUri(entry: InternalFileEntry): string | undefined;
};

export type PaintingGenerateJobDependencies = {
  ai: PaintingAi;
  paintings: {
    replaceOutputs(id: string, outputFileIds: readonly FileEntryId[]): Promise<Painting>;
  };
  storage: PaintingFileStorage;
};

/**
 * Without a timeout a hung provider request would hold the queue's single
 * concurrency slot until the next cold start; ten minutes is generous for the
 * slowest image providers while still guaranteeing the slot comes back.
 */
const GENERATE_TIMEOUT_MS = 10 * 60_000;

export function createPaintingGenerateJobHandler(
  dependencies: PaintingGenerateJobDependencies,
): JobHandlerFor<'painting.generate'> {
  return {
    defaultConcurrency: 1,
    defaultQueue: () => PAINTING_JOB_QUEUE,
    defaultRetryPolicy: { backoff: 'none', baseDelayMs: 0, maxAttempts: 1, maxDelayMs: 0 },
    defaultTimeoutMs: GENERATE_TIMEOUT_MS,
    executionClass: 'foreground-only',
    recovery: 'abandon',
    // Deleting the receipt this job writes through must cancel it first. The
    // input already carries the id, so no `paintingId -> jobId` index is needed:
    // the registration is that index, for as long as the execution lives.
    scopes: (input) => [{ id: input.paintingId, kind: 'painting' }],
    async execute(ctx): Promise<PaintingGenerationResult> {
      const { images, mode, modelId, paintingId, paramValues, prompt } = ctx.input;
      const { ai, paintings, storage } = dependencies;

      const inputImages = await Promise.all(
        images.map((image) => storage.readDataUrl(image.uri, image.mediaType)),
      );
      throwIfAborted(ctx.signal);
      const result = await ai.generateImage({
        inputImages,
        mode,
        paramValues,
        prompt,
        requestOptions: { signal: ctx.signal },
        uniqueModelId: modelId,
      });
      throwIfAborted(ctx.signal);

      if (result.images.length === 0) {
        throw new Error('Image provider returned no image');
      }

      const createdOutputs: InternalFileEntry[] = [];
      let outputRefsCommitted = false;
      try {
        for (const image of result.images) {
          createdOutputs.push(
            await storage.createInternalEntry({
              cleanupPolicy: 'delete_when_unreferenced',
              data: image.base64,
              mediaType: image.mediaType,
              source: 'base64',
            }),
          );
        }
        const painting = await paintings.replaceOutputs(
          paintingId,
          createdOutputs.map((entry) => entry.id),
        );
        outputRefsCommitted = true;
        throwIfAborted(ctx.signal);
        const persistedOutputIds = new Set(painting.files.output);
        const outputs = createdOutputs.map((entry) => {
          if (!persistedOutputIds.has(entry.id)) {
            throw new Error('Generated painting has a missing output file');
          }
          const uri = storage.getUri(entry);
          if (!uri) {
            throw new Error(`Generated painting file is unavailable: ${entry.id}`);
          }
          return { fileEntryId: entry.id, uri };
        });

        return { outputs, painting };
      } catch (error) {
        if (!outputRefsCommitted) {
          await storage.discard(createdOutputs);
        }
        throw error;
      }
    },
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? new Error('Painting generation aborted');
  }
}
