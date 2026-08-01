import type {
  PaintingGenerationInput,
  PaintingGenerationResult,
  PaintingGenerationSession,
  PaintingsBackend,
  ResolvedPaintingFiles,
} from '@/shared/contracts';
import type { PaintingListQuery } from '@cherrystudio/universal/data/api/schemas/paintings';
import type { CursorPaginationResponse } from '@cherrystudio/universal/data/api/types';
import type {
  FileEntryId,
  PreparedInternalFile,
  ResolvedFile,
} from '@cherrystudio/universal/data/types/file';
import { parseUniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Painting } from '@cherrystudio/universal/data/types/painting';

type PaintingRepository = {
  create(input: {
    inputFileIds: readonly FileEntryId[];
    modelId: string;
    preparedInputFiles: readonly PreparedInternalFile[];
    prompt: string;
    providerId: string;
  }): Promise<Painting>;
  get(id: string): Promise<Painting>;
  listIds(): Promise<string[]>;
  listPage(query?: PaintingListQuery): Promise<CursorPaginationResponse<Painting>>;
  removeMany(ids: readonly string[]): Promise<void>;
  replaceOutputs(id: string, outputs: readonly PreparedInternalFile[]): Promise<Painting>;
};

type PaintingAi = {
  generateImage(input: {
    inputImages: string[];
    mode: PaintingGenerationInput['mode'];
    paramValues: PaintingGenerationInput['paramValues'];
    prompt: string;
    requestOptions: { signal: AbortSignal };
    uniqueModelId: PaintingGenerationInput['modelId'];
  }): Promise<{ images: { base64: string; mediaType: string }[] }>;
};

type PaintingFileStorage = {
  discard(files: readonly PreparedInternalFile[]): void;
  prepareGeneratedImage(base64: string, mediaType: string): PreparedInternalFile;
  prepareInput(uri: string, name: string): Promise<PreparedInternalFile>;
  readDataUrl(uri: string, mediaType: string): Promise<string>;
};

type PaintingFileRepository = {
  resolve(id: FileEntryId): Promise<ResolvedFile | null>;
};

export type PaintingsServiceDependencies = {
  ai: PaintingAi;
  files: PaintingFileRepository;
  paintings: PaintingRepository;
  storage: PaintingFileStorage;
};

export class PaintingsService implements PaintingsBackend {
  constructor(private readonly dependencies: PaintingsServiceDependencies) {}

  createGenerationSession(): PaintingGenerationSession {
    return new PaintingGenerationSessionImpl(this.dependencies);
  }

  get(id: string): Promise<Painting> {
    return this.dependencies.paintings.get(id);
  }

  listIds(): Promise<string[]> {
    return this.dependencies.paintings.listIds();
  }

  listPage(query?: PaintingListQuery): Promise<CursorPaginationResponse<Painting>> {
    return this.dependencies.paintings.listPage(query);
  }

  removeMany(ids: readonly string[]): Promise<void> {
    return this.dependencies.paintings.removeMany(ids);
  }

  async resolveFiles(painting: Painting): Promise<ResolvedPaintingFiles> {
    const [inputs, outputs] = await Promise.all([
      resolveFileEntries(this.dependencies.files, painting.files.input),
      resolveFileEntries(this.dependencies.files, painting.files.output),
    ]);
    return { inputs, outputs };
  }
}

type IncompleteReceipt = {
  id: string;
  signature: string;
};

class PaintingGenerationSessionImpl implements PaintingGenerationSession {
  private disposed = false;
  private generating = false;
  private incompleteReceipt: IncompleteReceipt | undefined;

  constructor(private readonly dependencies: PaintingsServiceDependencies) {}

  dispose(): void {
    this.disposed = true;
    this.incompleteReceipt = undefined;
  }

  async generate(
    input: PaintingGenerationInput,
    signal: AbortSignal,
  ): Promise<PaintingGenerationResult> {
    if (this.disposed) {
      throw new Error('Painting generation session is disposed');
    }
    if (this.generating) {
      throw new Error('Painting generation is already in progress');
    }
    throwIfAborted(signal);

    this.generating = true;
    try {
      const prompt = input.prompt.trim();
      const signature = generationSignature({ ...input, prompt });
      let receiptId =
        this.incompleteReceipt?.signature === signature ? this.incompleteReceipt.id : undefined;

      if (!receiptId) {
        receiptId = await this.createReceipt({ ...input, prompt }, signal);
        this.incompleteReceipt = { id: receiptId, signature };
      }

      const inputImages = await Promise.all(
        input.images.map((image) =>
          this.dependencies.storage.readDataUrl(image.uri, image.mediaType),
        ),
      );
      throwIfAborted(signal);
      const result = await this.dependencies.ai.generateImage({
        inputImages,
        mode: input.mode,
        paramValues: input.paramValues,
        prompt,
        requestOptions: { signal },
        uniqueModelId: input.modelId,
      });
      throwIfAborted(signal);

      if (result.images.length === 0) {
        throw new Error('Image provider returned no image');
      }

      const preparedOutputs: PreparedInternalFile[] = [];
      try {
        for (const image of result.images) {
          preparedOutputs.push(
            this.dependencies.storage.prepareGeneratedImage(image.base64, image.mediaType),
          );
        }
      } catch (error) {
        this.dependencies.storage.discard(preparedOutputs);
        throw error;
      }

      const painting = await this.dependencies.paintings.replaceOutputs(receiptId, preparedOutputs);
      const persistedOutputIds = new Set(painting.files.output);
      const outputs = preparedOutputs.map((output) => {
        if (!persistedOutputIds.has(output.id)) {
          throw new Error('Generated painting has a missing output file');
        }
        return { fileEntryId: output.id, uri: output.uri };
      });

      this.incompleteReceipt = undefined;
      return { outputs, painting };
    } finally {
      this.generating = false;
    }
  }

  private async createReceipt(
    input: PaintingGenerationInput,
    signal: AbortSignal,
  ): Promise<string> {
    const preparedInputs: PreparedInternalFile[] = [];
    try {
      for (const image of input.images) {
        if (!image.fileEntryId) {
          throwIfAborted(signal);
          preparedInputs.push(await this.dependencies.storage.prepareInput(image.uri, image.name));
        }
      }
      throwIfAborted(signal);
      const { providerId } = parseUniqueModelId(input.modelId);
      const receipt = await this.dependencies.paintings.create({
        inputFileIds: input.images.flatMap((image) =>
          image.fileEntryId ? [image.fileEntryId] : [],
        ),
        modelId: input.modelId,
        preparedInputFiles: preparedInputs,
        prompt: input.prompt,
        providerId,
      });
      return receipt.id;
    } catch (error) {
      this.dependencies.storage.discard(preparedInputs);
      throw error;
    }
  }
}

async function resolveFileEntries(files: PaintingFileRepository, ids: readonly FileEntryId[]) {
  const entries = await Promise.all(ids.map((id) => files.resolve(id)));
  return entries.filter((entry) => entry !== null);
}

function generationSignature(input: PaintingGenerationInput): string {
  return JSON.stringify({
    images: input.images.map((image) => image.fileEntryId ?? `${image.id}:${image.uri}`),
    mode: input.mode,
    modelId: input.modelId,
    paramValues: sortRecord(input.paramValues),
    prompt: input.prompt,
  });
}

function sortRecord(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? new Error('Painting generation aborted');
  }
}
