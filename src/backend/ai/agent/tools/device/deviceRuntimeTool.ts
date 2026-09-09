/**
 * Shared plumbing for the device capability tools.
 *
 * Three rules from `docs/references/agent/agent-tools-and-resources.md` live
 * here so no individual tool has to remember them:
 *
 * 1. OS permission is not an approval substitute. The catalog only offers a
 *    tool whose scopes were grantable when the turn was admitted; this wrapper
 *    rechecks them again immediately before the side effect, because the user
 *    can revoke access in Settings while a turn is running. Requestable scopes
 *    trigger a system prompt here, after the in-app approval. Health summaries
 *    can proceed with a subset of their requested metrics.
 * 2. A failure the model could act on is a value, not a throw. A thrown error
 *    reaches the model as an opaque "tool execution failed", which tells it
 *    nothing about whether retrying could work.
 * 3. Cancellation propagates. An aborted turn rethrows instead of settling as
 *    a retryable failure that would keep the tool loop running.
 */

import * as z from 'zod';

import { isAbortError } from '@/backend/services/webSearch/utils/errors';
import {
  canRequestDevicePermission,
  canUseDevicePermission,
  type DevicePermissionScope,
  type PermissionStatuses,
  type PermissionsModule,
} from '@/shared/contracts';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { RuntimeJsonValue, RuntimeTool, RuntimeToolResult } from '../../runtime';
import { toRuntimeInputSchema } from '../runtimeToolSchema';

const logger = loggerService.withContext('DeviceRuntimeTool');

/** Messages that cannot become truthy by trying again with the same input. */
const PERMANENT_FAILURE_PATTERN = /denied|permission|read-only|not found|unavailable|no writable/i;

export type DevicePermissionReader = Pick<PermissionsModule, 'getStatuses' | 'request'>;

export type DeviceToolDependencies = {
  devicePermissions: DevicePermissionReader;
};

type DeviceRuntimeToolInput<TSchema extends z.ZodType> = {
  capabilityId: string;
  deps: DeviceToolDependencies;
  description: string;
  displayName: string;
  inputSchema: TSchema;
  permissionScopes:
    | readonly DevicePermissionScope[]
    | ((input: z.output<TSchema>) => readonly DevicePermissionScope[]);
  permissionMatch?: 'any';
  run(
    input: z.output<TSchema>,
    signal: AbortSignal,
    permissions: PermissionStatuses,
  ): Promise<unknown>;
};

export function createDeviceRuntimeTool<TSchema extends z.ZodType>(
  input: DeviceRuntimeToolInput<TSchema>,
): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId: input.capabilityId },
    providerName: input.capabilityId,
    displayName: input.displayName,
    description: input.description,
    inputSchema: toRuntimeInputSchema(input.inputSchema),
    // The catalog overrides this from the resolved binding policy; the value
    // here is only the floor a tool declares for itself.
    approval: 'ask',
    async execute({ input: rawInput, signal }) {
      const parsed = input.inputSchema.safeParse(rawInput);
      if (!parsed.success) {
        // The model wrote this call, so it is the one that can fix it.
        return {
          value: {
            status: 'error',
            message: `Invalid input: ${z.prettifyError(parsed.error)}`,
            retryable: true,
          },
          artifacts: [],
        };
      }

      try {
        throwIfAborted(signal);
        const scopes =
          typeof input.permissionScopes === 'function'
            ? input.permissionScopes(parsed.data)
            : input.permissionScopes;
        const permissions = await assertPermissions(
          input.deps,
          scopes,
          input.capabilityId,
          signal,
          input.permissionMatch,
        );
        throwIfAborted(signal);
        const value = await input.run(parsed.data, signal, permissions);
        throwIfAborted(signal);
        return { value: (value ?? null) as RuntimeJsonValue, artifacts: [] };
      } catch (error) {
        if (signal.aborted || isAbortError(error)) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('Device tool failed', { capabilityId: input.capabilityId, error: message });
        return deviceToolError(message, !PERMANENT_FAILURE_PATTERN.test(message));
      }
    },
  };
}

/**
 * Failures carry their own follow-up instruction: the model sees only this
 * value, so "what should I do now" has to travel with it.
 */
function deviceToolError(message: string, retryable: boolean): RuntimeToolResult {
  return {
    value: {
      status: 'error',
      message: retryable
        ? `${message} Retry once, and tell the user if it fails again.`
        : `${message} Tell the user; retrying without a settings or data change cannot help.`,
      retryable,
    },
    artifacts: [],
  };
}

async function assertPermissions(
  deps: DeviceToolDependencies,
  scopes: readonly DevicePermissionScope[],
  capabilityId: string,
  signal: AbortSignal,
  match?: 'any',
): Promise<PermissionStatuses> {
  let statuses = await deps.devicePermissions.getStatuses(scopes);
  const requestable = scopes.filter((scope) => canRequestDevicePermission(statuses[scope]));
  throwIfAborted(signal);
  if (requestable.length) {
    statuses = { ...statuses, ...(await deps.devicePermissions.request(requestable)) };
  }
  const allowed = scopes.map((scope) => canUseDevicePermission(scope, statuses[scope]));
  if (match === 'any' ? !allowed.some(Boolean) : !allowed.every(Boolean)) {
    throw new Error(`System permission for ${capabilityId} is not available`);
  }
  return statuses;
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) {
    return;
  }
  if (signal.reason instanceof Error) {
    throw signal.reason;
  }
  throw Object.assign(new Error('The device tool call was aborted.'), { name: 'AbortError' });
}
