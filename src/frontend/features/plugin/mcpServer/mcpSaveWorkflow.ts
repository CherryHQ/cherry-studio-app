import type { McpSaveStep } from '@/shared/contracts/mcp';
import { McpOperationError, readMcpOperationStep } from '@/shared/data/api/mcpFailureFacts';

export type { McpSaveStep } from '@/shared/contracts/mcp';

class McpConnectionProbeError extends Error {
  constructor(
    cause: unknown,
    readonly operation?: object,
  ) {
    super('MCP connection probe failed', { cause });
  }
}

/** Preserve even primitive rejections when a probe runs inside a combined save operation. */
export async function runMcpConnectionProbe<T>(probe: Promise<T>, operation?: object): Promise<T> {
  try {
    return await probe;
  } catch (error) {
    throw new McpConnectionProbeError(error, operation);
  }
}

export async function runMcpSaveWorkflow(deps: {
  validate(operation: object): { ok: true } | { ok: false; errorKey: string };
  /** False means the user quietly cancelled authorization. */
  authorize?(operation: object): Promise<boolean>;
  probe(operation: object): Promise<void>;
  persist(operation: object): Promise<void>;
  grantCleanup(operation: object): Promise<void>;
}): Promise<{ ok: true } | { ok: false; step: McpSaveStep; error: unknown }> {
  let step: McpSaveStep = 'validation';
  let operation = {};
  let result: Awaited<ReturnType<typeof runMcpSaveWorkflow>> = { ok: true };
  try {
    const validation = deps.validate(operation);
    if (!validation.ok) {
      result = { ok: false, step, error: validation };
    } else {
      step = 'authorization';
      operation = {};
      const proceed = deps.authorize ? await deps.authorize(operation) : true;
      if (proceed) {
        step = 'connection';
        operation = {};
        await deps.probe(operation);
        step = 'persistence';
        operation = {};
        await deps.persist(operation);
      }
    }
  } catch (error) {
    const isConnectionProbe =
      error instanceof McpConnectionProbeError && error.operation === operation;
    const rejection = isConnectionProbe ? error.cause : error;
    const cause = rejection instanceof McpOperationError ? rejection.cause : rejection;
    result = {
      ok: false,
      step: readMcpOperationStep(rejection, operation) ?? (isConnectionProbe ? 'connection' : step),
      error: cause,
    };
  } finally {
    try {
      operation = {};
      await deps.grantCleanup(operation);
    } catch (error) {
      if (result.ok)
        result = {
          ok: false,
          step: readMcpOperationStep(error, operation) ?? 'persistence',
          error,
        };
    }
  }
  return result;
}
