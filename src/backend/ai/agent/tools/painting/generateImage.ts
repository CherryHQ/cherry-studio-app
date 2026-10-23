/**
 * Image generation capability.
 *
 * Pi supplies a validated request and receives managed artifact refs. It never
 * constructs provider options, holds credentials, or sees base64 bytes: the
 * generated images are imported into managed storage first, and only their
 * `file_entry` ids cross back (agent-tools-and-resources.md, Image Generation).
 */

import type { CanonicalParamKey, ParamValues } from '@cherrystudio/provider-registry';
import type { GenerateImageOutput } from '@cherrystudio/universal/ai/builtinTools';
import { ZodError } from 'zod';

import type { AiService, AiUsageAttribution } from '@/backend/ai/AiService';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import type { ModelService } from '@/backend/data/services/ModelService';
import type { CreateInternalEntryInput } from '@/backend/services/file/fileStorage';
import { isAbortError } from '@/backend/services/webSearch/utils/errors';
import type { ResolvedFile } from '@/shared/contracts';
import { AiRequestError } from '@/shared/contracts/aiFailure';
import { FileAttachmentError } from '@/shared/contracts/fileAttachment';
import { loggerService } from '@/shared/core/logger/LoggerService';
import {
  type FileEntry,
  type FileEntryId,
  FileEntryIdSchema,
  readableFilename,
} from '@/shared/data/types/file';
import {
  isUniqueModelId,
  ModelSchema,
  type Model,
  type UniqueModelId,
} from '@/shared/data/types/model';
import { generatedImageExtension } from '@/shared/utils/imageFileTypes';
import {
  createPaintingGenerationStrategy,
  PaintingGenerationError,
  type PaintingGenerationStrategy,
} from '@/shared/utils/paintingGenerationStrategy';

import type { TurnFileScope } from '../../resources/managedFileResolver';
import type { RuntimeError } from '../../runtime';
import type { GenerateImageToolInput } from './generateImageSchema';

const logger = loggerService.withContext('GenerateImageTool');

export const PAINTING_ERROR_NOTE =
  'The image generation request failed. Inform the user; do not automatically repeat the request.';
const PAINTING_STORAGE_ERROR_NOTE =
  'The generated images could not be saved. Inform the user; do not automatically repeat the paid generation.';
export const PAINTING_MODEL_NOT_CONFIGURED_NOTE =
  'No drawing model is configured. Tell the user to pick one in Settings > Model; do not retry until then.';
export const PAINTING_EDIT_NOT_SUPPORTED_NOTE =
  "The configured drawing model can't edit images. Tell the user to choose an edit-capable drawing model; do not retry with this model.";
export const PAINTING_GENERATE_NOT_SUPPORTED_NOTE =
  "The configured drawing model can't generate a new image without input images. Ask for image references or tell the user to choose a generation-capable drawing model.";
export const PAINTING_INPUT_IMAGE_ERROR_NOTE =
  'The reference image is unavailable or could not be read as an image. Use the intended image file entry id already visible in this conversation. If that image is no longer available, ask the user to attach it again, not to supply a technical id. Do not substitute text-only generation.';
export const PAINTING_INPUT_IMAGE_NOT_IN_TURN_NOTE =
  'One or more image references are not part of this conversation. Reuse the intended image file entry id from a conversation attachment or an earlier tool result. If the image is outside this conversation, ask the user to attach it, not to supply a technical id.';

export type ConfiguredPaintingModel = {
  model: Model;
  uniqueModelId: UniqueModelId;
};

export type PaintingToolDependencies = {
  ai: Pick<AiService, 'generateImage'>;
  files: {
    createInternalEntry(input: CreateInternalEntryInput): Promise<FileEntry>;
    discard(files: readonly FileEntry[]): Promise<void>;
    readDataUrl(uri: string, mediaType: string, signal?: AbortSignal): Promise<string>;
    resolve(id: FileEntryId): Promise<ResolvedFile | null>;
  };
  preference: Pick<PreferenceService, 'get'>;
  models: Pick<ModelService, 'getById'>;
};

export type PaintingError = { error: RuntimeError };
export type PaintingResult = { entries: FileEntry[] } | PaintingError;

export function isPaintingError(result: PaintingResult): result is PaintingError {
  return 'error' in result;
}

/** Model-facing projection of a successful generation: refs, never bytes. */
export function toGenerateImageOutput(entries: readonly FileEntry[]): GenerateImageOutput {
  return entries.map((entry) => ({ id: entry.id, name: entry.filename }));
}

/** Only a model the shared strategy can run counts as configured, so an unusable one omits the tool. */
export async function resolveConfiguredPaintingModel(
  dependencies: Pick<PaintingToolDependencies, 'preference' | 'models'>,
): Promise<ConfiguredPaintingModel | null> {
  const uniqueModelId = await dependencies.preference.get('feature.paintings.default_model_id');
  if (!isUniqueModelId(uniqueModelId)) {
    return null;
  }

  const stored = await dependencies.models.getById(uniqueModelId);
  if (!stored) return null;
  // Parsing copies nested capability data so later model updates cannot mutate this turn's rules.
  const model = ModelSchema.parse(stored);
  return createPaintingGenerationStrategy(model).kind === 'unavailable'
    ? null
    : { model, uniqueModelId };
}

export async function generateImageFromPrompt(
  dependencies: PaintingToolDependencies,
  input: GenerateImageToolInput,
  signal: AbortSignal,
  configuredModel: ConfiguredPaintingModel | null,
  strategy: PaintingGenerationStrategy,
  turnFiles: TurnFileScope,
  usageAttribution?: AiUsageAttribution,
): Promise<PaintingResult> {
  throwIfAborted(signal);
  if (!configuredModel || strategy.kind === 'unavailable') {
    return paintingError('image_model_unavailable', PAINTING_MODEL_NOT_CONFIGURED_NOTE);
  }

  const { uniqueModelId } = configuredModel;
  const imageIds = [...new Set(input.image_ids ?? [])];
  let images: ResolvedFile[] = [];
  if (imageIds.length > 0) {
    // The turn ledger is the authority for what this conversation may read. A
    // valid-looking id from anywhere else (another session, the wider library)
    // proves existence, not authorization.
    if (imageIds.some((id) => !turnFiles.fileEntryIds.has(id))) {
      return paintingError('image_reference_not_authorized', PAINTING_INPUT_IMAGE_NOT_IN_TURN_NOTE);
    }
    try {
      images = await Promise.all(
        imageIds.map(async (id) => {
          const resolved = await dependencies.files.resolve(FileEntryIdSchema.parse(id));
          if (!resolved || !resolved.entry.mediaType.startsWith('image/')) {
            throw new Error('The reference file is not an available image');
          }
          return resolved;
        }),
      );
    } catch (error) {
      if (signal.aborted || isAbortError(error)) {
        throw error;
      }
      logger.warn('Failed to resolve generate_image input images', error as Error);
      return paintingError('image_reference_unavailable', PAINTING_INPUT_IMAGE_ERROR_NOTE);
    }
    throwIfAborted(signal);
  }

  let request: ReturnType<PaintingGenerationStrategy['prepare']>;
  try {
    request = strategy.prepare({
      images: images.map(({ entry }) => ({
        fileEntryId: entry.id,
        name: entry.filename,
        mediaType: entry.mediaType,
        size: entry.size,
      })),
      prompt: input.prompt,
      paramValues: extractParamValues(input, strategy),
    });
  } catch (error) {
    if (error instanceof PaintingGenerationError) {
      const message =
        error.issue.code === 'images-unsupported'
          ? PAINTING_EDIT_NOT_SUPPORTED_NOTE
          : error.issue.code === 'image-required'
            ? PAINTING_GENERATE_NOT_SUPPORTED_NOTE
            : `Invalid image request: ${error.issue.code}. Correct the request before trying again.`;
      return paintingError('invalid_image_request', message);
    }
    if (error instanceof ZodError)
      return paintingError('invalid_image_request', 'The image request has invalid parameters.');
    if (error instanceof FileAttachmentError)
      return paintingError(
        'image_reference_invalid',
        `The reference image cannot be used: ${error.issue.code}. Ask the user for a supported image; do not substitute text-only generation.`,
      );
    throw error;
  }

  let inputImages: string[];
  try {
    inputImages = await Promise.all(
      images.map(({ entry, uri }) => dependencies.files.readDataUrl(uri, entry.mediaType, signal)),
    );
    throwIfAborted(signal);
  } catch (error) {
    if (signal.aborted || isAbortError(error)) throw error;
    return paintingError('image_reference_unavailable', PAINTING_INPUT_IMAGE_ERROR_NOTE);
  }

  const createdFiles: FileEntry[] = [];
  let stage: 'request' | 'storage' = 'request';
  try {
    const result = await dependencies.ai.generateImage({
      ...request,
      ...(inputImages.length > 0 && { inputImages }),
      requestOptions: { signal },
      uniqueModelId,
      usageAttribution,
    });
    throwIfAborted(signal);
    if (result.images.length === 0) {
      return paintingError('image_generation_empty', 'The image provider returned no image.');
    }

    stage = 'storage';
    for (const [index, image] of result.images.entries()) {
      createdFiles.push(
        await dependencies.files.createInternalEntry({
          data: image.base64,
          mediaType: image.mediaType,
          // Named after the prompt so the library reads as what was drawn.
          name: readableFilename(input.prompt, {
            extension: generatedImageExtension(image.mediaType),
            fallback: 'Image',
            ordinal: index + 1,
          }),
          provenance: 'generated',
          source: 'base64',
        }),
      );
      throwIfAborted(signal);
    }
    return { entries: createdFiles };
  } catch (error) {
    // A half-finished generation must not leave orphan entries in the library.
    await discardCreatedFiles(dependencies, createdFiles);
    if (signal.aborted || isAbortError(error)) {
      throw error;
    }
    logger.error('generate_image failed', error as Error, { uniqueModelId });
    if (stage === 'request' && error instanceof AiRequestError) throw error;
    return paintingError(
      stage === 'storage' ? 'image_storage_failed' : 'image_generation_failed',
      stage === 'storage' ? PAINTING_STORAGE_ERROR_NOTE : PAINTING_ERROR_NOTE,
    );
  }
}

function paintingError(code: string, message: string): PaintingError {
  return { error: { code, message, retryable: false, origin: 'tool' } };
}

function extractParamValues(
  input: GenerateImageToolInput,
  strategy: PaintingGenerationStrategy,
): ParamValues {
  const parameters = strategy.resolveParameters(input.image_ids?.length ?? 0);
  return Object.fromEntries(
    Object.entries(input).flatMap(([key, value]) => {
      if (key === 'prompt' || key === 'image_ids') return [];
      const spec = parameters?.definition.supports[key as CanonicalParamKey];
      // Tool inputs name custom-size fields directly; the shared strategy accepts canonical requests.
      return [
        [
          spec?.type === 'size' ? (spec.pairedEnumKey ?? 'size') : key,
          spec?.type === 'size' && typeof value === 'string' ? value.toLowerCase() : value,
        ],
      ];
    }),
  ) as ParamValues;
}

async function discardCreatedFiles(
  dependencies: Pick<PaintingToolDependencies, 'files'>,
  files: readonly FileEntry[],
): Promise<void> {
  if (files.length === 0) {
    return;
  }
  try {
    await dependencies.files.discard(files);
  } catch (error) {
    logger.warn('Failed to discard generate_image outputs after an error', error as Error);
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) {
    return;
  }
  if (signal.reason instanceof Error) {
    throw signal.reason;
  }
  throw Object.assign(new Error('Image generation was aborted.'), { name: 'AbortError' });
}
