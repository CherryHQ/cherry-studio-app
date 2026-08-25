import { getRequestContext } from '@cherrystudio/ai-runtime/tools';
import { GENERATE_IMAGE_TOOL_NAME } from '@cherrystudio/universal/ai/builtinTools';
import { dynamicTool } from 'ai';

import {
  buildGenerateImageToolSchema,
  type GenerateImageToolInput,
} from '../../../generateImageTool';
import {
  type ConfiguredPaintingModel,
  GENERATE_IMAGE_DESCRIPTION,
  generateImageFromPrompt,
  paintingModelOutput,
  type PaintingResult,
  type PaintingToolDependencies,
  resolveConfiguredPaintingModel,
} from '../../../painting';
import type { ToolEntry } from '../../../types';

export { GENERATE_IMAGE_TOOL_NAME };

export function createGenerateImageTool(
  dependencies: PaintingToolDependencies,
  configuredModel: ConfiguredPaintingModel | null,
) {
  const inputSchema = buildGenerateImageToolSchema(configuredModel?.support);
  return dynamicTool({
    description: GENERATE_IMAGE_DESCRIPTION,
    inputSchema,
    execute: async (input, options) => {
      const parsed = inputSchema.parse(input) as GenerateImageToolInput;
      return generateImageFromPrompt(
        dependencies,
        parsed,
        getRequestContext(options).abortSignal,
        configuredModel,
      );
    },
    toModelOutput: ({ output }) => paintingModelOutput(output as PaintingResult),
  });
}

/** Resolves the setting once and returns a standalone tool; it is intentionally not registered. */
export async function createConfiguredGenerateImageTool(dependencies: PaintingToolDependencies) {
  return createGenerateImageTool(dependencies, await resolveConfiguredPaintingModel(dependencies));
}

export function createGenerateImageToolEntry(dependencies: PaintingToolDependencies): ToolEntry {
  return {
    applies: (scope) => scope.paintingModel !== null,
    buildTool: (scope) => createGenerateImageTool(dependencies, scope.paintingModel),
    defer: 'auto',
    description: GENERATE_IMAGE_DESCRIPTION,
    name: GENERATE_IMAGE_TOOL_NAME,
    namespace: 'media',
    tool: createGenerateImageTool(dependencies, null),
  };
}

export type { GenerateImageToolInput };
export type GenerateImageToolOutput = PaintingResult;
