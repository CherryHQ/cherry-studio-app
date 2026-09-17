import type { ImageGenerationMode, ParamValues } from '@cherrystudio/provider-registry';

import { FileAttachmentError, type FileAttachmentFact } from '@/shared/contracts/fileAttachment';
import type { Model } from '@/shared/data/types/model';

import { MAX_IMAGE_ATTACHMENT_COUNT, validateFileAttachments } from './fileAttachmentPolicy';
import { prepareImageParamRequest, resolveImageGenerationMode } from './imageGenerationParams';
import { resolvePaintingGenerationMode } from './paintingModelSupport';

type PaintingMode = Extract<ImageGenerationMode, 'generate' | 'edit'>;
export type PaintingGenerationIssue =
  | {
      code:
        | 'model-unavailable'
        | 'image-required'
        | 'images-unsupported'
        | 'prompt-required'
        | 'invalid-parameters'
        | 'mode-changed';
    }
  | { code: 'too-many-images'; limit: number };

export class PaintingGenerationError extends Error {
  constructor(readonly issue: PaintingGenerationIssue) {
    super(`Invalid painting request: ${issue.code}`);
    this.name = 'PaintingGenerationError';
  }
}

export type PaintingGenerationStrategy = ReturnType<typeof createPaintingGenerationStrategy>;

/**
 * One model-bound strategy for controls and both execution owners. Routes are
 * resolved once; callers never branch on model names or infer edit from images.
 */
export function createPaintingGenerationStrategy(model: Model | undefined) {
  const isAvailable = model !== undefined && model.isEnabled !== false && !model.isHidden;
  const withoutImages = isAvailable ? resolvePaintingGenerationMode(model, false) : undefined;
  const withImages = isAvailable ? resolvePaintingGenerationMode(model, true) : undefined;
  const kind: 'generate-only' | 'generate-and-edit' | 'image-required' | 'unavailable' =
    withoutImages
      ? withImages
        ? 'generate-and-edit'
        : 'generate-only'
      : withImages
        ? 'image-required'
        : 'unavailable';
  const maxInputImages = withImages
    ? Math.min(
        MAX_IMAGE_ATTACHMENT_COUNT,
        model?.imageGeneration?.modes[withImages]?.maxInputImages ?? MAX_IMAGE_ATTACHMENT_COUNT,
      )
    : 0;
  const resolveMode = (imageCount: number): PaintingMode | undefined =>
    imageCount > 0 ? withImages : withoutImages;
  const resolveParameters = (imageCount: number) =>
    resolveImageGenerationMode(model?.imageGeneration, resolveMode(imageCount));
  const inputIssue = (imageCount: number): PaintingGenerationIssue | undefined => {
    if (kind === 'unavailable') return { code: 'model-unavailable' };
    if (imageCount === 0 && !withoutImages) return { code: 'image-required' };
    if (imageCount > 0 && !withImages) return { code: 'images-unsupported' };
    if (imageCount > maxInputImages) return { code: 'too-many-images', limit: maxInputImages };
    return undefined;
  };
  return {
    kind,
    canGenerate: withoutImages !== undefined,
    acceptsImages: withImages !== undefined,
    maxInputImages,
    resolveMode,
    resolveParameters,
    inputIssue,
    requiresPrompt: (imageCount: number) =>
      resolveParameters(imageCount)?.definition.requirePrompt !== false,
    attachmentTarget: {
      purpose: 'painting' as const,
      acceptsImages: withImages !== undefined,
      maxImages: maxInputImages,
    },
    /** Metadata here may come from a query; admission must supply authoritative facts. */
    canReference(image: FileAttachmentFact) {
      if (!withImages) return false;
      try {
        validateFileAttachments([image], {
          purpose: 'painting',
          acceptsImages: true,
          maxImages: maxInputImages,
        });
        return true;
      } catch (error) {
        if (error instanceof FileAttachmentError) return false;
        throw error;
      }
    },
    prepare(input: {
      images: readonly FileAttachmentFact[];
      prompt: string;
      mode?: ImageGenerationMode;
      paramValues: ParamValues;
    }) {
      const images = [...new Map(input.images.map((image) => [image.fileEntryId, image])).values()];
      const issue = inputIssue(images.length);
      if (issue) throw new PaintingGenerationError(issue);
      const mode = resolveMode(images.length)!;
      if (input.mode !== undefined && input.mode !== mode)
        throw new PaintingGenerationError({ code: 'mode-changed' });
      validateFileAttachments(images, {
        purpose: 'painting',
        acceptsImages: withImages !== undefined,
        maxImages: maxInputImages,
      });
      const parameters = resolveParameters(images.length);
      if (parameters?.definition.requirePrompt !== false && !input.prompt.trim())
        throw new PaintingGenerationError({ code: 'prompt-required' });
      const paramValues = prepareImageParamRequest(input.paramValues, parameters);
      if (!paramValues) throw new PaintingGenerationError({ code: 'invalid-parameters' });
      return { mode, paramValues, prompt: input.prompt.trim() };
    },
  };
}
