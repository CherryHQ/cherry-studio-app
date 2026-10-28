import type {
  AiService,
  AiUsageAttribution,
  AiUsageAttributionResolver,
} from '@/backend/ai/AiService';
import { fileLibraryService } from '@/backend/data/services/FileLibraryService';
import type { ModelService } from '@/backend/data/services/ModelService';
import type { CreateInternalEntryInput } from '@/backend/services/file/fileStorage';
import {
  AgentProtocolError,
  type AgentImageGeneration,
  type AgentInputPart,
} from '@/shared/contracts/agent';
import { AiRequestError } from '@/shared/contracts/aiFailure';
import { FileAttachmentError } from '@/shared/contracts/fileAttachment';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { type FileEntry, readableFilename } from '@/shared/data/types/file';
import { createUniqueModelId } from '@/shared/data/types/model';
import { generatedImageExtension } from '@/shared/utils/imageFileTypes';
import { isImageGenerationModel } from '@/shared/utils/modelPurpose';
import { createPaintingGenerationStrategy } from '@/shared/utils/paintingGenerationStrategy';

import type { ManagedFileResolver, TurnResourceLedger } from '../resources/managedFileResolver';
import {
  createImageRequestErrorToolResult,
  DURABLE_IMAGE_TOOL_NAME,
  raceAbort,
  type RuntimeModel,
  type RuntimeTool,
} from '../runtime';
import { runtimeUserText } from './turnRuntimeInput';

const logger = loggerService.withContext('AgentImageGeneration');
const GENERATE_TIMEOUT_MS = 10 * 60_000;

/**
 * Runs one image request under the turn's signal and a 10-minute deadline. Provider image calls
 * sit outside Pi's stream idle timer, so without the deadline a hung request would hold the turn
 * until the user stops it. The deadline aborts with a `TimeoutError`.
 */
export async function withImageGenerationDeadline<T>(
  turnSignal: AbortSignal,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(turnSignal.reason);
  turnSignal.addEventListener('abort', abort, { once: true });
  if (turnSignal.aborted) abort();
  const timer = setTimeout(() => {
    controller.abort(
      Object.assign(new Error('Image generation timed out.'), { name: 'TimeoutError' }),
    );
  }, GENERATE_TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
    turnSignal.removeEventListener('abort', abort);
  }
}

export function isImageGenerationTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}

/** A prepared direct image request, owned by the same Host turn as text requests. */
export type AgentImageGenerationPlan = {
  settings: AgentImageGeneration;
  execute(signal: AbortSignal, usageAttribution: AiUsageAttribution): Promise<FileEntry[]>;
};

export type AgentImageGenerationPort = {
  prepare(input: {
    workspaceFolderId?: string | null;
    instructions: string;
    model: RuntimeModel;
    parts: readonly AgentInputPart[];
    resources: TurnResourceLedger;
    settings?: AgentImageGeneration;
    signal: AbortSignal;
  }): Promise<AgentImageGenerationPlan | null>;
};

export function createAgentImageGeneration(dependencies: {
  ai: Pick<AiService, 'generateImage'>;
  models: Pick<ModelService, 'getById'>;
  files: Pick<ManagedFileResolver, 'readAsDataUrl'>;
  storage: {
    createInternalEntry(input: CreateInternalEntryInput): Promise<FileEntry>;
    discard(entries: readonly FileEntry[]): Promise<void>;
  };
}): AgentImageGenerationPort {
  return {
    async prepare({ workspaceFolderId, instructions, model, parts, resources, settings, signal }) {
      const uniqueModelId = createUniqueModelId(model.providerId, model.modelId);
      const selectedModel = await raceAbort(dependencies.models.getById(uniqueModelId), signal);
      if (!selectedModel) reject('The selected model is unavailable.');
      if (!isImageGenerationModel(selectedModel)) {
        if (settings) reject('Image generation requires an image model.');
        return null;
      }

      const files = [...resources.inputFiles.values()];
      if (workspaceFolderId) await fileLibraryService.resolveDirectory(workspaceFolderId, '.');
      const rawPrompt = parts
        .flatMap((part) => (part.type === 'text' ? [part.text] : []))
        .join('\n');
      const prepared = createPaintingGenerationStrategy(selectedModel).prepare({
        images: files,
        prompt: rawPrompt,
        mode: settings?.mode,
        paramValues: settings?.paramValues ?? {},
      });
      const modelPrompt = parts
        .flatMap((part) => (part.type === 'text' ? [runtimeUserText(part)] : []))
        .join('\n');
      const capturedSettings = { mode: prepared.mode, paramValues: prepared.paramValues };
      return {
        settings: capturedSettings,
        execute(turnSignal, usageAttribution) {
          return withImageGenerationDeadline(turnSignal, async (requestSignal) => {
            const entries: FileEntry[] = [];
            try {
              requestSignal.throwIfAborted();
              const inputImages = await Promise.all(
                files.map(async (file) => {
                  const data = await dependencies.files.readAsDataUrl(file, requestSignal);
                  if (!data)
                    throw new FileAttachmentError({
                      code: 'unavailable',
                      fileEntryId: file.fileEntryId,
                    });
                  return data;
                }),
              );
              requestSignal.throwIfAborted();
              const result = await raceAbort(
                dependencies.ai.generateImage({
                  ...capturedSettings,
                  inputImages,
                  prompt: [
                    instructions.trim(),
                    parts.some((part) => part.type === 'text' && part.quotes)
                      ? modelPrompt
                      : modelPrompt.trim(),
                  ]
                    .filter(Boolean)
                    .join('\n\n'),
                  requestOptions: { signal: requestSignal },
                  uniqueModelId,
                  usageAttribution,
                }),
                requestSignal,
              );
              requestSignal.throwIfAborted();
              if (result.images.length === 0) throw new Error('Image provider returned no image.');
              for (const [index, image] of result.images.entries()) {
                entries.push(
                  await dependencies.storage.createInternalEntry({
                    folderId: workspaceFolderId ?? null,
                    data: image.base64,
                    mediaType: image.mediaType,
                    name: readableFilename(rawPrompt, {
                      extension: generatedImageExtension(image.mediaType),
                      fallback: 'Image',
                      ordinal: index + 1,
                    }),
                    provenance: 'generated',
                    source: 'base64',
                  }),
                );
                requestSignal.throwIfAborted();
              }
              // The Host adopts all returned entries into the reserved assistant message.
              return entries;
            } catch (error) {
              if (entries.length > 0) {
                await dependencies.storage.discard(entries).catch((discardError) => {
                  logger.warn('Failed to discard uncommitted image outputs', discardError as Error);
                });
              }
              throw error;
            }
          });
        },
      };
    },
  };
}

/** The single Host tool an explicit image turn schedules; it runs the prepared request. */
export function createImageRequestTool(
  imageGeneration: AgentImageGenerationPlan,
  resolveUsageAttribution: AiUsageAttributionResolver,
): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId: 'image_generation' },
    providerName: DURABLE_IMAGE_TOOL_NAME,
    displayName: 'Generate image',
    description: 'Execute the explicitly submitted image request.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    approval: 'auto',
    execute: async ({ signal }) => {
      try {
        const entries = await imageGeneration.execute(signal, resolveUsageAttribution());
        return {
          value: { status: 'completed' },
          artifacts: entries.map((entry) => ({
            ref: { kind: 'managed-file', fileEntryId: entry.id },
            mediaType: entry.mediaType,
            name: entry.filename,
            kind: 'created',
          })),
        };
      } catch (error) {
        if (signal.aborted || !(error instanceof AiRequestError)) throw error;
        // AiService already normalized and redacted this request failure. Preserve it at the
        // capability boundary so both tool traces and the final reply keep its structured facts.
        return createImageRequestErrorToolResult(error.detail);
      }
    },
  };
}

function reject(message: string): never {
  throw new AgentProtocolError({ code: 'CAPABILITY_UNSUPPORTED', message, retryable: false });
}
