import { GENERATE_IMAGE_TOOL_NAME } from '@cherrystudio/universal/ai/builtinTools';
import * as z from 'zod';

import type { TurnFileScope } from '../../resources/managedFileResolver';
import type { RuntimeTool } from '../../runtime';
import { toRuntimeInputSchema } from '../runtimeToolSchema';
import {
  type ConfiguredPaintingModel,
  GENERATE_IMAGE_DESCRIPTION,
  generateImageFromPrompt,
  isPaintingError,
  type PaintingToolDependencies,
  toGenerateImageOutput,
} from './generateImage';
import { buildGenerateImageToolSchema, type GenerateImageToolInput } from './generateImageSchema';

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
): RuntimeTool {
  const inputSchema = buildGenerateImageToolSchema(configuredModel?.support);

  return {
    ref: { source: 'builtin', capabilityId: GENERATE_IMAGE_TOOL_NAME },
    providerName: GENERATE_IMAGE_TOOL_NAME,
    displayName: 'Generate image',
    description: GENERATE_IMAGE_DESCRIPTION,
    inputSchema: toRuntimeInputSchema(inputSchema),
    // Generation spends the user's provider quota, so it asks unless an Agent
    // binding says otherwise (agent-tools-and-resources.md, Image Generation).
    approval: 'ask',
    async execute({ input, signal }) {
      const parsed = inputSchema.safeParse(input);
      if (!parsed.success) {
        return {
          value: {
            status: 'error',
            message: `Invalid input: ${z.prettifyError(parsed.error)}`,
            retryable: true,
          },
          artifacts: [],
        };
      }

      const result = await generateImageFromPrompt(
        dependencies,
        parsed.data as GenerateImageToolInput,
        signal,
        configuredModel,
        turnFiles,
      );
      if (isPaintingError(result)) {
        return {
          value: { status: 'error', message: result.error, retryable: false },
          artifacts: [],
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
