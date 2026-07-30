import type { ToolResultOutput } from '@ai-sdk/provider-utils';
import type { JSONValue, Tool, ToolExecutionOptions } from 'ai';
import * as z from 'zod';
import { loggerService } from '@/core/logger/LoggerService';
import type { PreferenceService } from '@/data/services/PreferenceService';
import type { DevicePermissionService } from '@/services/devicePermissions';
import { isAbortError } from '@/services/webSearch/utils/errors';
import type { PermissionPreferenceKey } from '@/shared/data/preference';

import { getRequestContext } from '../context';
import type { ToolEntry } from '../types';

const logger = loggerService.withContext('DeviceTool');

export type DeviceToolDependencies = {
  devicePermission: Pick<DevicePermissionService, 'getStatusForPreference'>;
  preference: Pick<PreferenceService, 'get'>;
};

export const deviceToolErrorSchema = z
  .object({ error: z.string(), retryable: z.boolean() })
  .strict();
export type DeviceToolError = z.infer<typeof deviceToolErrorSchema>;

export function createDeviceToolEntry(input: {
  deps: DeviceToolDependencies;
  description: string;
  name: string;
  namespace: string;
  platforms?: readonly string[];
  preferenceKeys: readonly PermissionPreferenceKey[];
  tool: Tool;
}): ToolEntry {
  return {
    defer: 'never',
    description: input.description,
    name: input.name,
    namespace: input.namespace,
    tool: guardDeviceTool(input),
    applies: (scope) =>
      (input.platforms?.includes(scope.platform) ?? true) &&
      input.preferenceKeys.every((key) => {
        const access = scope.deviceAccess[key];
        return access.mode !== 'never' && access.status === 'granted';
      }),
  };
}

export async function runDeviceTool<T>(
  operation: () => Promise<T>,
  options: ToolExecutionOptions,
): Promise<T | DeviceToolError> {
  const context = getRequestContext(options);
  try {
    if (context.abortSignal?.aborted) throw abortReason(context.abortSignal);
    return await operation();
  } catch (error) {
    if (context.abortSignal?.aborted || options.abortSignal?.aborted || isAbortError(error)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('Native device tool failed', { error: message });
    return {
      error: message,
      retryable: !/denied|permission|read-only|not found|unavailable|no writable/i.test(message),
    };
  }
}

export function deviceToolModelOutput(output: unknown): ToolResultOutput {
  if (isDeviceToolError(output)) {
    return {
      type: 'text' as const,
      value: output.retryable
        ? `${output.error} Retry once or tell the user if it fails again.`
        : `${output.error} Tell the user; retrying without a settings or data change will not help.`,
    };
  }
  return { type: 'json', value: output as JSONValue };
}

function guardDeviceTool(input: {
  deps: DeviceToolDependencies;
  name: string;
  preferenceKeys: readonly PermissionPreferenceKey[];
  tool: Tool;
}): Tool {
  if (!input.tool.execute) return input.tool;
  const execute = input.tool.execute;
  return {
    ...input.tool,
    metadata: { cherry: { tool: { name: input.name, type: 'builtin' } } },
    needsApproval: async () => {
      try {
        const modes = await Promise.all(
          input.preferenceKeys.map((key) => input.deps.preference.get(key)),
        );
        if (modes.some((mode) => mode === 'never')) return false;
        return modes.some((mode) => mode === 'ask');
      } catch (error) {
        logger.warn('Device tool approval policy lookup failed', { error, toolName: input.name });
        return true;
      }
    },
    execute: async (...args: Parameters<typeof execute>) => {
      const modes = await Promise.all(
        input.preferenceKeys.map((key) => input.deps.preference.get(key)),
      );
      if (modes.some((mode) => mode === 'never')) {
        throw new Error(`Device tool is disabled: ${input.name}`);
      }
      const statuses = await Promise.all(
        input.preferenceKeys.map((key) => input.deps.devicePermission.getStatusForPreference(key)),
      );
      if (statuses.some((status) => status !== 'granted')) {
        throw new Error(`Device tool requires system permission: ${input.name}`);
      }
      return execute(...args);
    },
  } as Tool;
}

function isDeviceToolError(value: unknown): value is DeviceToolError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<DeviceToolError>).error === 'string' &&
    typeof (value as Partial<DeviceToolError>).retryable === 'boolean'
  );
}

function abortReason(signal: AbortSignal): unknown {
  if (signal.reason !== undefined) return signal.reason;
  const error = new Error('Operation aborted');
  error.name = 'AbortError';
  return error;
}
