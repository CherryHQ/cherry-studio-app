/**
 * Image generation capability.
 *
 * Pi supplies a validated request and receives managed artifact refs. It never
 * constructs provider options, holds credentials, or sees base64 bytes: the
 * generated images are imported into managed storage first, and only their
 * `file_entry` ids cross back (agent-tools-and-resources.md, Image Generation).
 */

import {
  buildParamsSchema,
  type ImageGenerationMode,
  type ImageGenerationSupport,
  type ParamValues,
} from '@cherrystudio/provider-registry';
import type { GenerateImageOutput } from '@cherrystudio/universal/ai/builtinTools';

import type { AiService } from '@/backend/ai/AiService';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import type { ProviderRegistryService } from '@/backend/data/services/ProviderRegistryService';
import type { CreateInternalEntryInput } from '@/backend/services/file/fileStorage';
import { isAbortError } from '@/backend/services/webSearch/utils/errors';
import type { ResolvedFile } from '@/shared/contracts';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { type FileEntry, type FileEntryId, FileEntryIdSchema } from '@/shared/data/types/file';
import { isUniqueModelId, parseUniqueModelId, type UniqueModelId } from '@/shared/data/types/model';

import type { TurnFileScope } from '../../resources/managedFileResolver';
import { type GenerateImageToolInput, limitGenerateImageInputIds } from './generateImageSchema';

const logger = loggerService.withContext('GenerateImageTool');

export const GENERATE_IMAGE_DESCRIPTION = `Generate or edit an image using the user's configured drawing model.

Use this when:
- The user asks you to draw, paint, illustrate, or generate an image, picture, logo, or icon.
- The user asks you to modify a previously generated image and provides its file entry id.

Notes:
- Describe the desired image or edit vividly in the prompt.
- Pass image_ids only when editing or using an existing image as a reference.
- Generation can take 10-60 seconds.
- Requires a drawing model configured in Settings > Model. If none is set, tell the user instead of retrying.`;

export const PAINTING_ERROR_NOTE =
  'Image generation failed (provider error); retry or inform the user.';
export const PAINTING_MODEL_NOT_CONFIGURED_NOTE =
  'No drawing model is configured. Tell the user to pick one in Settings > Model; do not retry until then.';
export const PAINTING_EDIT_NOT_SUPPORTED_NOTE =
  "The configured drawing model can't edit images. Tell the user to choose an edit-capable drawing model; do not retry with this model.";
export const PAINTING_GENERATE_NOT_SUPPORTED_NOTE =
  "The configured drawing model can't generate a new image without input images. Ask for image references or tell the user to choose a generation-capable drawing model.";
export const PAINTING_INPUT_IMAGE_ERROR_NOTE =
  'One or more image references could not be read as images. Ask the user for valid generated-image file entry ids.';
export const PAINTING_INPUT_IMAGE_NOT_IN_TURN_NOTE =
  'One or more image references are not part of this conversation. Only file entry ids visible in this session may be used; ask the user to attach the image instead.';

export type ConfiguredPaintingModel = {
  support: ImageGenerationSupport | null;
  uniqueModelId: UniqueModelId;
};

export type PaintingToolDependencies = {
  ai: Pick<AiService, 'generateImage'>;
  files: {
    createInternalEntry(input: CreateInternalEntryInput): Promise<FileEntry>;
    discard(files: readonly FileEntry[]): Promise<void>;
    readDataUrl(uri: string, mediaType: string): Promise<string>;
    resolve(id: FileEntryId): Promise<ResolvedFile | null>;
  };
  preference: Pick<PreferenceService, 'get'>;
  providerRegistry: Pick<ProviderRegistryService, 'getImageGenerationSupport'>;
};

export type PaintingError = { error: string };
export type PaintingResult = { entries: FileEntry[] } | PaintingError;

export function isPaintingError(result: PaintingResult): result is PaintingError {
  return 'error' in result;
}

/** Model-facing projection of a successful generation: refs, never bytes. */
export function toGenerateImageOutput(entries: readonly FileEntry[]): GenerateImageOutput {
  return entries.map((entry) => ({ id: entry.id, name: entry.filename }));
}

export async function resolveConfiguredPaintingModel(
  dependencies: Pick<PaintingToolDependencies, 'preference' | 'providerRegistry'>,
): Promise<ConfiguredPaintingModel | null> {
  const uniqueModelId = await dependencies.preference.get('feature.paintings.default_model_id');
  if (!isUniqueModelId(uniqueModelId)) {
    return null;
  }

  const { modelId, providerId } = parseUniqueModelId(uniqueModelId);
  const support = dependencies.providerRegistry.getImageGenerationSupport(providerId, modelId);
  return { support: support ?? null, uniqueModelId };
}

export async function generateImageFromPrompt(
  dependencies: PaintingToolDependencies,
  input: GenerateImageToolInput,
  signal: AbortSignal,
  configuredModel: ConfiguredPaintingModel | null,
  turnFiles: TurnFileScope,
): Promise<PaintingResult> {
  throwIfAborted(signal);
  const resolvedModel = configuredModel ?? (await resolveConfiguredPaintingModel(dependencies));
  if (!resolvedModel) {
    return { error: PAINTING_MODEL_NOT_CONFIGURED_NOTE };
  }

  const { support, uniqueModelId } = resolvedModel;
  const mode = resolveMode(input);
  if (
    (mode === 'edit' && !support?.modes.edit) ||
    (mode === 'generate' && support && !support.modes.generate)
  ) {
    return {
      error:
        mode === 'edit' ? PAINTING_EDIT_NOT_SUPPORTED_NOTE : PAINTING_GENERATE_NOT_SUPPORTED_NOTE,
    };
  }

  let inputImages: string[] | undefined;
  if (mode === 'edit') {
    // The turn ledger is the authority for what this conversation may read. A
    // valid-looking id from anywhere else (another session, the wider library)
    // proves existence, not authorization.
    if ((input.image_ids ?? []).some((id) => !turnFiles.fileEntryIds.has(id))) {
      return { error: PAINTING_INPUT_IMAGE_NOT_IN_TURN_NOTE };
    }
    try {
      inputImages = await resolveInputImages(dependencies, input.image_ids ?? []);
    } catch (error) {
      if (signal.aborted || isAbortError(error)) {
        throw error;
      }
      logger.warn('Failed to resolve generate_image input images', error as Error);
      return { error: PAINTING_INPUT_IMAGE_ERROR_NOTE };
    }
    throwIfAborted(signal);
  }

  const createdFiles: FileEntry[] = [];
  try {
    const result = await dependencies.ai.generateImage({
      ...(inputImages && { inputImages }),
      mode,
      paramValues: extractParamValues(input, support, mode),
      prompt: input.prompt,
      requestOptions: { signal },
      uniqueModelId,
    });
    throwIfAborted(signal);

    for (const image of result.images) {
      createdFiles.push(
        await dependencies.files.createInternalEntry({
          data: image.base64,
          mediaType: image.mediaType,
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
    return { error: PAINTING_ERROR_NOTE };
  }
}

function resolveMode(input: GenerateImageToolInput): ImageGenerationMode {
  return input.image_ids && input.image_ids.length > 0 ? 'edit' : 'generate';
}

function extractParamValues(
  input: GenerateImageToolInput,
  support: ImageGenerationSupport | null,
  mode: ImageGenerationMode,
): ParamValues {
  const supports = support?.modes[mode]?.supports;
  if (!supports) {
    return {};
  }

  const candidate: Record<string, unknown> = {};
  for (const key of Object.keys(supports)) {
    const value = input[key as keyof GenerateImageToolInput];
    if (value !== undefined && value !== null && value !== '') {
      candidate[key] = value;
    }
  }

  const parsed = buildParamsSchema(support, mode).parse(candidate);
  const paramValues: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(supports)) {
    const value = parsed[key];
    if (value !== undefined) {
      paramValues[spec.type === 'size' && spec.pairedEnumKey ? spec.pairedEnumKey : key] = value;
    }
  }
  return paramValues as ParamValues;
}

async function resolveInputImages(
  dependencies: Pick<PaintingToolDependencies, 'files'>,
  imageIds: readonly string[],
): Promise<string[]> {
  return Promise.all(
    limitGenerateImageInputIds(imageIds).map(async (id) => {
      const resolved = await dependencies.files.resolve(FileEntryIdSchema.parse(id));
      if (!resolved || !resolved.entry.mediaType.startsWith('image/')) {
        throw new Error(`File entry ${id} is not an image`);
      }
      return dependencies.files.readDataUrl(resolved.uri, resolved.entry.mediaType);
    }),
  );
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
