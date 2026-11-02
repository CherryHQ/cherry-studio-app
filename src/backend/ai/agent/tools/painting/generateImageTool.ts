import { GENERATE_IMAGE_TOOL_NAME } from '@cherrystudio/universal/ai/builtinTools';
import * as z from 'zod';

import type { AiUsageAttributionResolver } from '@/backend/ai/AiService';
import { AiRequestError } from '@/shared/contracts/aiFailure';
import { createPaintingGenerationStrategy } from '@/shared/utils/paintingGenerationStrategy';

import type { TurnFileScope } from '../../resources/managedFileResolver';
import {
  createErrorToolResult,
  createImageRequestErrorToolResult,
  type RuntimeTool,
} from '../../runtime';
import { toRuntimeInputSchema } from '../runtimeToolSchema';
import {
  type ConfiguredPaintingModel,
  generateImageFromPrompt,
  isPaintingError,
  type PaintingResult,
  type PaintingToolDependencies,
  toGenerateImageOutput,
} from './generateImage';
import {
  buildGenerateImageToolDescription,
  buildGenerateImageToolSchema,
  type GenerateImageToolInput,
} from './generateImageSchema';

export { GENERATE_IMAGE_TOOL_NAME };

/**
 * The input contract is frozen from the drawing model configured when the turn
 * was admitted, so changing the setting mid-turn cannot alter the active
 * catalog.
 */
export function createGenerateImageTool(
  dependencies: PaintingToolDependencies,
  configuredModel: ConfiguredPaintingModel | null,
  turnFiles: TurnFileScope,
  resolveUsageAttribution?: AiUsageAttributionResolver,
): RuntimeTool {
  const strategy = createPaintingGenerationStrategy(configuredModel?.model);
  const inputSchema = buildGenerateImageToolSchema(strategy);

  return {
    ref: { source: 'builtin', capabilityId: GENERATE_IMAGE_TOOL_NAME },
    providerName: GENERATE_IMAGE_TOOL_NAME,
    displayName: 'Generate image',
    description: buildGenerateImageToolDescription(strategy),
    inputSchema: toRuntimeInputSchema(inputSchema),
    deferred: true,
    // Generation spends provider quota, so the catalog preserves explicit consent.
    approval: 'ask',
    async execute({ input, signal }) {
      const parsed = inputSchema.safeParse(input);
      if (!parsed.success) {
        const error = {
          code: 'invalid_image_request',
          message: `Invalid input: ${z.prettifyError(parsed.error)}`,
          retryable: true,
          origin: 'tool' as const,
        };
        return {
          ...createErrorToolResult(error),
          failure: { error, scope: 'call' },
        };
      }

      let result: PaintingResult;
      try {
        result = await generateImageFromPrompt(
          dependencies,
          parsed.data as GenerateImageToolInput,
          signal,
          configuredModel,
          strategy,
          turnFiles,
          resolveUsageAttribution?.(),
        );
      } catch (error) {
        if (signal.aborted || !(error instanceof AiRequestError)) throw error;
        return createImageRequestErrorToolResult(error.detail);
      }
      if (isPaintingError(result)) {
        return {
          ...createErrorToolResult(result.error),
          failure: { error: result.error, scope: 'call' },
        };
      }

      return {
        value: toGenerateImageOutput(result.entries),
        // Pi projects each artifact as a `purpose: 'artifact'` file part, which
        // is what puts the generated image in the transcript.
        artifacts: result.entries.map((entry) => ({
          ref: { kind: 'managed-file' as const, fileEntryId: entry.id },
          mediaType: entry.mediaType,
          name: entry.filename,
          kind: 'created' as const,
        })),
      };
    },
  };
}
