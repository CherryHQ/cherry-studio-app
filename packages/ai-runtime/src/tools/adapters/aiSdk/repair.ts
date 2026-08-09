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

import type { AppProviderSettingsMap } from '../../../types';
import { emitToolRuntimeDiagnostic, type ToolRuntimeDiagnostics } from './types';

type AppProviderId = StringKeys<AppProviderSettingsMap>;

export interface AiRepairContext<T extends AppProviderId = AppProviderId> {
  providerId: T;
  providerSettings: AppProviderSettingsMap[T];
  modelId: string;
  getUsagePlugins?: () => AiPlugin[];
  diagnostics?: ToolRuntimeDiagnostics;
}

export function createAiRepair<T extends AppProviderId>(
  context: AiRepairContext<T>,
): ToolCallRepairFunction<ToolSet> {
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
        context.getUsagePlugins?.(),
      );
      if (result.output === undefined || result.output === null) {
        return null;
      }
      return { ...toolCall, input: JSON.stringify(result.output) };
    } catch (repairError) {
      emitToolRuntimeDiagnostic(context.diagnostics, {
        code: 'tool-repair-failed',
        error: repairError,
        toolName: toolCall.toolName,
      });
      return null;
    }
  };
}
