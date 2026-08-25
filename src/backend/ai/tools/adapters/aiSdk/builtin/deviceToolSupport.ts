import type { ToolResultOutput } from '@ai-sdk/provider-utils';
import { getRequestContext } from '@cherrystudio/ai-runtime/tools';
import type { JSONValue, Tool, ToolExecutionOptions } from 'ai';
import * as z from 'zod';

import type { DevicePermissions } from '@/backend/services/permissions';
import { isAbortError } from '@/backend/services/webSearch/utils/errors';
import type { DevicePermissionScope } from '@/shared/contracts';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { ToolEntry } from '../../../types';

const logger = loggerService.withContext('DeviceTool');

export type DeviceToolDependencies = {
  devicePermissions: Pick<DevicePermissions, 'getStatusForScope'>;
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
  permissionScopes: readonly DevicePermissionScope[];
  platforms?: readonly string[];
  requiresApproval?: boolean;
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
      input.permissionScopes.every(
        (permissionScope) => scope.deviceAccess[permissionScope] === 'granted',
      ),
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
  permissionScopes: readonly DevicePermissionScope[];
  requiresApproval?: boolean;
  tool: Tool;
}): Tool {
  if (!input.tool.execute) return input.tool;
  const execute = input.tool.execute;
  return {
    ...input.tool,
    metadata: { cherry: { tool: { name: input.name, type: 'builtin' } } },
    needsApproval: input.requiresApproval === true,
    execute: async (...args: Parameters<typeof execute>) => {
      const statuses = await Promise.all(
        input.permissionScopes.map((permissionScope) =>
          input.deps.devicePermissions.getStatusForScope(permissionScope),
        ),
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
