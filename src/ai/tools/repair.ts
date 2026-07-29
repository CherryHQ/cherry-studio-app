import { type AiPlugin, generateText as aiCoreGenerateText } from '@cherrystudio/ai-core';
import type { StringKeys } from '@cherrystudio/ai-core/provider';
import {
  InvalidToolInputError,
  type JSONSchema7,
  jsonSchema,
  Output,
  type ToolCallRepairFunction,
  type ToolSet,
} from 'ai';
import { loggerService } from '@/core/logger/LoggerService';

import type { AppProviderSettingsMap } from '../types';

const logger = loggerService.withContext('ToolCallRepair');
type AppProviderId = StringKeys<AppProviderSettingsMap>;

export function createAiRepair<T extends AppProviderId>(context: {
  providerId: T;
  providerSettings: AppProviderSettingsMap[T];
  modelId: string;
  plugins?: AiPlugin[];
}): ToolCallRepairFunction<ToolSet> {
  return async ({ error, inputSchema, toolCall }) => {
    if (!InvalidToolInputError.isInstance(error)) {
      return null;
    }

    let schema: JSONSchema7;
    try {
      schema = await inputSchema({ toolName: toolCall.toolName });
    } catch {
      return null;
    }

    const originalInput =
      typeof toolCall.input === 'string' ? toolCall.input : JSON.stringify(toolCall.input);
    try {
      const result = await aiCoreGenerateText<AppProviderSettingsMap, T>(
        context.providerId,
        context.providerSettings,
        {
          model: context.modelId,
          output: Output.object({ schema: jsonSchema(schema) }),
          prompt: [
            'Correct the invalid tool arguments as JSON while preserving the original intent.',
            `Tool: ${toolCall.toolName}`,
            `Original arguments: ${originalInput}`,
            `Validation error: ${error.message}`,
          ].join('\n'),
        },
        context.plugins,
      );
      if (result.output === undefined || result.output === null) {
        return null;
      }
      return { ...toolCall, input: JSON.stringify(result.output) };
    } catch (repairError) {
      logger.warn('Tool call repair failed', { error: repairError, toolName: toolCall.toolName });
      return null;
    }
  };
}
