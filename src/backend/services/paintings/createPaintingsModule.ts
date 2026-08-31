import type { Database } from '@/backend/data/db/DbService';
import type {
  PaintingGenerationInput,
  PaintingGenerationStart,
  PaintingsModule,
  ResolvedFile,
  ResolvedPaintingFiles,
} from '@/shared/contracts';
import type { FileEntry, FileEntryId } from '@/shared/data/types/file';
import { parseUniqueModelId } from '@/shared/data/types/model';
import type { Painting } from '@/shared/data/types/painting';

import type {
  PaintingFileStorage,
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
  files: PaintingFileRepository;
  jobs: PaintingJobsPort;
  paintings: PaintingGenerationPersistence;
  storage: Pick<PaintingFileStorage, 'createInternalEntry' | 'discard'>;
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

/**
 * Creates the receipt and enqueues the `painting.generate` job in one write
 * transaction — on rollback neither exists. Draft-only images are materialized
 * into internal entries first (file IO cannot ride the transaction); the
 * receipt's `files.input` is what records them, so an entry no receipt ended up
 * recording — on failure or on an idempotency hit — is discarded before
 * returning.
 */
async function startGeneration(
  dependencies: PaintingsModuleDependencies,
  input: PaintingGenerationInput,
): Promise<PaintingGenerationStart> {
  const prompt = input.prompt.trim();
  const signature = generationSignature({ ...input, prompt });
  const createdInputs: FileEntry[] = [];
  let createdInputsSettled = false;
  try {
    const images: PaintingGenerateJobImage[] = [];
    for (const image of input.images) {
      if (image.fileEntryId) {
        images.push({ fileEntryId: image.fileEntryId, mediaType: image.mediaType, uri: image.uri });
      } else {
        const entry = await dependencies.storage.createInternalEntry({
          mediaType: image.mediaType,
          name: image.name,
          provenance: 'imported',
          source: 'uri',
          uri: image.uri,
        });
        createdInputs.push(entry);
        images.push({ fileEntryId: entry.id, mediaType: image.mediaType, uri: image.uri });
      }
    }

    const { providerId } = parseUniqueModelId(input.modelId);
    const result = await dependencies.db.withWriteTx(async (tx) => {
      const existing = await dependencies.jobs.findActiveGenerateTx(tx, signature);
      if (existing) {
        return {
          jobId: existing.id,
          paintingId: activeJobPaintingId(existing.input),
          reusedActive: true,
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
      return { jobId: handle.id, paintingId: receipt.id, reusedActive: false };
    });

    if (result.reusedActive) {
      // The reused receipt already lists its own copies of these inputs.
      await dependencies.storage.discard(createdInputs);
    }
    createdInputsSettled = true;
    return { jobId: result.jobId, paintingId: result.paintingId };
  } finally {
    if (!createdInputsSettled) {
      await dependencies.storage.discard(createdInputs);
    }
  }
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
    images: input.images.map((image) => image.fileEntryId ?? `${image.id}:${image.uri}`),
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
