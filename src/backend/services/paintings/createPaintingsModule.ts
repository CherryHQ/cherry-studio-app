import type { Database } from '@/backend/data/db/DbService';
import type {
  PaintingGenerationInput,
  PaintingGenerationStart,
  PaintingsModule,
  ResolvedFile,
  FileModule,
  ResolvedPaintingFiles,
} from '@/shared/contracts';
import { FileAttachmentError } from '@/shared/contracts/fileAttachment';
import type { FileEntryId } from '@/shared/data/types/file';
import type { Model, UniqueModelId } from '@/shared/data/types/model';
import { parseUniqueModelId } from '@/shared/data/types/model';
import type { Painting } from '@/shared/data/types/painting';
import { supportsPaintingGenerationMode } from '@/shared/utils/paintingModelSupport';

import type {
  PaintingGenerateJobImage,
  PaintingGenerateJobInput,
} from './tasks/paintingGenerateJobHandler';

type PaintingReceiptInput = {
  inputFileIds: readonly FileEntryId[];
  modelId: string;
  prompt: string;
  providerId: string;
};

type PaintingGenerationPersistence = {
  createTx(tx: Database, input: PaintingReceiptInput): Promise<Painting>;
  resetForRetryTx(tx: Database, id: string, input: PaintingReceiptInput): Promise<Painting>;
};

type PaintingFileRepository = {
  resolve(id: FileEntryId): Promise<ResolvedFile | null>;
};

/**
 * Painting-scoped slice of the job runtime, closed over the concrete type in
 * composition so the module never touches the runtime or JobService directly.
 */
type PaintingJobsPort = {
  cancelGenerate(jobId: string): Promise<void>;
  enqueueGenerateTx(
    tx: Database,
    input: PaintingGenerateJobInput,
    opts: { idempotencyKey: string },
  ): Promise<{ id: string }>;
  findActiveGenerateTx(
    tx: Database,
    idempotencyKey: string,
  ): Promise<{ id: string; input: unknown } | null>;
};

export type PaintingsModuleDependencies = {
  db: { withWriteTx<TValue>(fn: (tx: Database) => Promise<TValue>): Promise<TValue> };
  files: PaintingFileRepository & Pick<FileModule, 'prepareAttachments'>;
  getModel(id: UniqueModelId): Promise<Model | null>;
  jobs: PaintingJobsPort;
  paintings: PaintingGenerationPersistence;
};

export function createPaintingsModule(dependencies: PaintingsModuleDependencies): PaintingsModule {
  return {
    cancelGeneration: (jobId) => dependencies.jobs.cancelGenerate(jobId),
    resolveFiles: async (painting: Painting): Promise<ResolvedPaintingFiles> => {
      const [inputs, outputs] = await Promise.all([
        resolveFileEntries(dependencies.files, painting.files.input),
        resolveFileEntries(dependencies.files, painting.files.output),
      ]);
      return { inputs, outputs };
    },
    startGeneration: (input) => startGeneration(dependencies, input),
  };
}

/** Validate all library references before creating a receipt or starting durable work. */
async function startGeneration(
  dependencies: PaintingsModuleDependencies,
  input: PaintingGenerationInput,
): Promise<PaintingGenerationStart> {
  const prompt = input.prompt.trim();
  const signature = generationSignature({ ...input, prompt });
  const model = await dependencies.getModel(input.modelId);
  const hasImages = input.fileEntryIds.length > 0;
  if (!model || !supportsPaintingGenerationMode(model, hasImages ? 'edit' : 'generate')) {
    throw new FileAttachmentError({ code: 'model-unsupported' });
  }
  const definition = model.imageGeneration?.modes[input.mode];
  if (model.imageGeneration && !definition)
    throw new FileAttachmentError({ code: 'model-unsupported' });
  const prepared = await dependencies.files.prepareAttachments({
    fileEntryIds: input.fileEntryIds,
    target: {
      purpose: 'painting',
      acceptsImages: supportsPaintingGenerationMode(model, 'edit'),
      maxImages: definition?.maxInputImages,
    },
  });
  const images: PaintingGenerateJobImage[] = prepared.map((file) => ({
    fileEntryId: file.entry.id,
    mediaType: file.entry.mediaType,
    uri: file.uri,
  }));
  const { providerId } = parseUniqueModelId(input.modelId);
  const result = await dependencies.db.withWriteTx(async (tx) => {
    const existing = await dependencies.jobs.findActiveGenerateTx(tx, signature);
    if (existing) {
      return {
        jobId: existing.id,
        paintingId: activeJobPaintingId(existing.input),
      };
    }
    const receiptInput = {
      inputFileIds: images.map((image) => image.fileEntryId),
      modelId: input.modelId,
      prompt,
      providerId,
    };
    const receipt = input.paintingId
      ? await dependencies.paintings.resetForRetryTx(tx, input.paintingId, receiptInput)
      : await dependencies.paintings.createTx(tx, receiptInput);
    const handle = await dependencies.jobs.enqueueGenerateTx(
      tx,
      {
        images,
        mode: input.mode,
        modelId: input.modelId,
        modelName: input.modelName,
        paintingId: receipt.id,
        paramValues: input.paramValues,
        prompt,
      },
      { idempotencyKey: signature },
    );
    return { jobId: handle.id, paintingId: receipt.id };
  });

  return { jobId: result.jobId, paintingId: result.paintingId };
}

async function resolveFileEntries(files: PaintingFileRepository, ids: readonly FileEntryId[]) {
  const entries = await Promise.all(ids.map((id) => files.resolve(id)));
  return entries.filter((entry) => entry !== null);
}

/**
 * The active job carries the receipt it writes into; an enqueued
 * `painting.generate` always has one, so a missing id means the ledger row was
 * written by something other than {@link startGeneration}.
 */
function activeJobPaintingId(jobInput: unknown): string {
  const paintingId = (jobInput as Partial<PaintingGenerateJobInput> | null)?.paintingId;
  if (typeof paintingId !== 'string' || paintingId.length === 0) {
    throw new Error('Active painting.generate job has no paintingId in its input');
  }
  return paintingId;
}

/**
 * `paintingId` participates so that retrying an interrupted receipt does not
 * collide with generating the very same prompt as a brand-new painting — same
 * inputs, different intent, and the idempotency hit would silently hand the
 * caller back the wrong receipt.
 */
function generationSignature(input: PaintingGenerationInput): string {
  return JSON.stringify({
    images: input.fileEntryIds,
    mode: input.mode,
    modelId: input.modelId,
    paintingId: input.paintingId ?? null,
    paramValues: sortRecord(input.paramValues),
    prompt: input.prompt,
  });
}

function sortRecord(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) => left.localeCompare(right)),
  );
}
