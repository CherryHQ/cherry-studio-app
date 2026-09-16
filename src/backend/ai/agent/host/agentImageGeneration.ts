import type { AiService, AiUsageAttribution } from '@/backend/ai/AiService';
import type { ModelService } from '@/backend/data/services/ModelService';
import type { CreateInternalEntryInput } from '@/backend/services/file/fileStorage';
import {
  AgentProtocolError,
  type AgentImageGeneration,
  type AgentInputPart,
} from '@/shared/contracts/agent';
import { FileAttachmentError } from '@/shared/contracts/fileAttachment';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { type FileEntry, readableFilename } from '@/shared/data/types/file';
import { createUniqueModelId } from '@/shared/data/types/model';
import { generatedImageExtension } from '@/shared/utils/imageFileTypes';
import { isImageGenerationModel } from '@/shared/utils/modelPurpose';
import { createPaintingGenerationStrategy } from '@/shared/utils/paintingGenerationStrategy';

import type { ManagedFileResolver, TurnResourceLedger } from '../resources/managedFileResolver';
import { raceAbort, type RuntimeModel } from '../runtime';

const logger = loggerService.withContext('AgentImageGeneration');
const GENERATE_TIMEOUT_MS = 10 * 60_000;

/** A prepared direct image request, owned by the same Host turn as text requests. */
export type AgentImageGenerationPlan = {
  settings: AgentImageGeneration;
  execute(signal: AbortSignal, usageAttribution: AiUsageAttribution): Promise<FileEntry[]>;
};

export type AgentImageGenerationPort = {
  prepare(input: {
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
    async prepare({ instructions, model, parts, resources, settings, signal }) {
      const uniqueModelId = createUniqueModelId(model.providerId, model.modelId);
      const selectedModel = await raceAbort(dependencies.models.getById(uniqueModelId), signal);
      if (!selectedModel) reject('The selected model is unavailable.');
      if (!isImageGenerationModel(selectedModel)) {
        if (settings) reject('Image generation requires an image model.');
        return null;
      }

      const files = [...resources.inputFiles.values()];
      const prompt = parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
      const prepared = createPaintingGenerationStrategy(selectedModel).prepare({
        images: files,
        prompt,
        mode: settings?.mode,
        paramValues: settings?.paramValues ?? {},
      });
      const capturedSettings = { mode: prepared.mode, paramValues: prepared.paramValues };
      return {
        settings: capturedSettings,
        async execute(turnSignal, usageAttribution) {
          const controller = new AbortController();
          const abort = () => controller.abort(turnSignal.reason);
          turnSignal.addEventListener('abort', abort, { once: true });
          if (turnSignal.aborted) abort();
          const timer = setTimeout(() => {
            controller.abort(
              Object.assign(new Error('Image generation timed out.'), { name: 'TimeoutError' }),
            );
          }, GENERATE_TIMEOUT_MS);
          const requestSignal = controller.signal;
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
                prompt: [instructions.trim(), prompt.trim()].filter(Boolean).join('\n\n'),
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
                  data: image.base64,
                  mediaType: image.mediaType,
                  name: readableFilename(prompt, {
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
          } finally {
            clearTimeout(timer);
            turnSignal.removeEventListener('abort', abort);
          }
        },
      };
    },
  };
}

function reject(message: string): never {
  throw new AgentProtocolError({ code: 'CAPABILITY_UNSUPPORTED', message, retryable: false });
}
