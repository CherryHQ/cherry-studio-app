import type { ResolvedFile } from '@cherrystudio/universal/data/api/schemas/files';
import type { FileEntryId, InternalFileEntry } from '@cherrystudio/universal/data/types/file';
import { parseUniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Painting } from '@cherrystudio/universal/data/types/painting';

import type {
  PaintingGenerationInput,
  PaintingGenerationResult,
  PaintingGenerationSession as PaintingGenerationSessionContract,
  PaintingsModule,
  ResolvedPaintingFiles,
} from '@/shared/contracts';

import type { CreateInternalEntryInput } from '../file/fileStorage';

type PaintingGenerationPersistence = {
  create(input: {
    inputFileIds: readonly FileEntryId[];
    modelId: string;
    prompt: string;
    providerId: string;
  }): Promise<Painting>;
  replaceOutputs(id: string, outputFileIds: readonly FileEntryId[]): Promise<Painting>;
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
  createInternalEntry(input: CreateInternalEntryInput): Promise<InternalFileEntry>;
  discard(entries: readonly InternalFileEntry[]): Promise<void>;
  readDataUrl(uri: string, mediaType: string): Promise<string>;
  resolveUri(entry: InternalFileEntry): string | undefined;
};

type PaintingFileRepository = {
  resolve(id: FileEntryId): Promise<ResolvedFile | null>;
};

export type PaintingsModuleDependencies = {
  ai: PaintingAi;
  files: PaintingFileRepository;
  paintings: PaintingGenerationPersistence;
  storage: PaintingFileStorage;
};

export function createPaintingsModule(dependencies: PaintingsModuleDependencies): PaintingsModule {
  return {
    createGenerationSession: () => new PaintingGenerationSession(dependencies),
    resolveFiles: async (painting: Painting): Promise<ResolvedPaintingFiles> => {
      const [inputs, outputs] = await Promise.all([
        resolveFileEntries(dependencies.files, painting.files.input),
        resolveFileEntries(dependencies.files, painting.files.output),
      ]);
      return { inputs, outputs };
    },
  };
}

type IncompleteReceipt = {
  id: string;
  signature: string;
};

class PaintingGenerationSession implements PaintingGenerationSessionContract {
  private activeController: AbortController | undefined;
  private disposed = false;
  private incompleteReceipt: IncompleteReceipt | undefined;

  constructor(private readonly dependencies: PaintingsModuleDependencies) {}

  cancel(): void {
    this.activeController?.abort(new Error('Painting generation cancelled'));
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.activeController?.abort(new Error('Painting generation session is disposed'));
    this.incompleteReceipt = undefined;
  }

  async generate(input: PaintingGenerationInput): Promise<PaintingGenerationResult> {
    if (this.disposed) {
      throw new Error('Painting generation session is disposed');
    }
    if (this.activeController) {
      throw new Error('Painting generation is already in progress');
    }

    const controller = new AbortController();
    const { signal } = controller;
    this.activeController = controller;
    try {
      const prompt = input.prompt.trim();
      const signature = generationSignature({ ...input, prompt });
      let receiptId =
        this.incompleteReceipt?.signature === signature ? this.incompleteReceipt.id : undefined;

      if (!receiptId) {
        receiptId = await this.createReceipt({ ...input, prompt }, signal);
        if (!this.disposed) {
          this.incompleteReceipt = { id: receiptId, signature };
        }
        throwIfAborted(signal);
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

      const createdOutputs: InternalFileEntry[] = [];
      let outputRefsCommitted = false;
      try {
        for (const image of result.images) {
          createdOutputs.push(
            await this.dependencies.storage.createInternalEntry({
              cleanupPolicy: 'delete_when_unreferenced',
              data: image.base64,
              mediaType: image.mediaType,
              source: 'base64',
            }),
          );
        }
        const painting = await this.dependencies.paintings.replaceOutputs(
          receiptId,
          createdOutputs.map((entry) => entry.id),
        );
        outputRefsCommitted = true;
        throwIfAborted(signal);
        const persistedOutputIds = new Set(painting.files.output);
        const outputs = createdOutputs.map((entry) => {
          if (!persistedOutputIds.has(entry.id)) {
            throw new Error('Generated painting has a missing output file');
          }
          const uri = this.dependencies.storage.resolveUri(entry);
          if (!uri) {
            throw new Error(`Generated painting file is unavailable: ${entry.id}`);
          }
          return { fileEntryId: entry.id, uri };
        });

        this.incompleteReceipt = undefined;
        return { outputs, painting };
      } catch (error) {
        if (!outputRefsCommitted) {
          await this.dependencies.storage.discard(createdOutputs);
        }
        throw error;
      }
    } finally {
      if (this.activeController === controller) {
        this.activeController = undefined;
      }
    }
  }

  private async createReceipt(
    input: PaintingGenerationInput,
    signal: AbortSignal,
  ): Promise<string> {
    const createdInputs: InternalFileEntry[] = [];
    let inputRefsCommitted = false;
    try {
      for (const image of input.images) {
        if (!image.fileEntryId) {
          throwIfAborted(signal);
          createdInputs.push(
            await this.dependencies.storage.createInternalEntry({
              cleanupPolicy: 'delete_when_unreferenced',
              name: image.name,
              source: 'uri',
              uri: image.uri,
            }),
          );
        }
      }
      throwIfAborted(signal);
      const { providerId } = parseUniqueModelId(input.modelId);
      const receipt = await this.dependencies.paintings.create({
        inputFileIds: [
          ...input.images.flatMap((image) => (image.fileEntryId ? [image.fileEntryId] : [])),
          ...createdInputs.map((entry) => entry.id),
        ],
        modelId: input.modelId,
        prompt: input.prompt,
        providerId,
      });
      inputRefsCommitted = true;
      return receipt.id;
    } catch (error) {
      if (!inputRefsCommitted) {
        await this.dependencies.storage.discard(createdInputs);
      }
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
