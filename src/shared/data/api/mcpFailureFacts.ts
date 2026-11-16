import type { McpConnectionFailure, McpSaveStep } from '@/shared/contracts/mcp';

/**
 * Decisions use the attempt/operation's own snapshot, never facts on a rejection.
 * attachMcpFailureFacts is only for fresh errors owned by the publishing operation;
 * it is first-writer-wins, including frozen errors via WeakMap. Never attach to an
 * SDK/transport rejection, which may be reused by another operation. At an outward
 * boundary, withMcpFailureFacts copies such a value before attaching this snapshot.
 * Error copies retain their prototype and descriptors; DOMException is reconstructed
 * with its internal slots, and other objects are wrapped with the original cause. Raw
 * rejection identity and primitive cancellation sentinels remain untouched internally.
 */
const failures = new WeakMap<object, McpConnectionFailure>();

export function attachMcpFailureFacts(error: unknown, facts: McpConnectionFailure): void {
  if (error && typeof error === 'object' && !readMcpFailureFacts(error)) {
    failures.set(error, facts);
    const descriptor = Object.getOwnPropertyDescriptor(error, 'connectionFailure');
    if (
      descriptor &&
      'value' in descriptor &&
      descriptor.value === undefined &&
      descriptor.writable
    )
      Object.defineProperty(error, 'connectionFailure', { value: facts });
    if (!Object.hasOwn(error, 'connectionFailure') && Object.isExtensible(error))
      Object.defineProperty(error, 'connectionFailure', {
        value: facts,
        configurable: true,
        enumerable: false,
      });
  }
}

export function withMcpFailureFacts(error: unknown, facts: McpConnectionFailure): unknown {
  if (!error || typeof error !== 'object') return error;
  if (readMcpFailureFacts(error) === facts) return error;
  const descriptors = Object.getOwnPropertyDescriptors(error);
  delete descriptors.connectionFailure;
  const copy =
    typeof DOMException !== 'undefined' && error instanceof DOMException
      ? Object.defineProperties(new DOMException(error.message, error.name), descriptors)
      : error instanceof Error
        ? Object.create(Object.getPrototypeOf(error), descriptors)
        : new Error('MCP operation failed', { cause: error });
  attachMcpFailureFacts(copy, facts);
  return copy;
}

export function readMcpFailureFacts(error: unknown): McpConnectionFailure | undefined {
  return error && typeof error === 'object' ? failures.get(error) : undefined;
}

/** One operation owns the step; rejection values can be primitive, frozen, or reused. */
export class McpOperationError extends Error {
  constructor(
    readonly step: McpSaveStep,
    cause: unknown,
    operation?: object,
  ) {
    super('MCP operation failed', { cause });
    attachMcpOperationStep(this, step, operation);
    const facts = readMcpFailureFacts(cause);
    if (facts) attachMcpFailureFacts(this, facts);
  }
}

export function withMcpOperationStep(
  error: unknown,
  step: McpSaveStep,
  operation?: object,
): unknown {
  if (error && typeof error === 'object' && readMcpOperationStep(error) === undefined) {
    attachMcpOperationStep(error, step, operation);
    return error;
  }
  return new McpOperationError(step, error, operation);
}

// The scope is passed through one call chain; reused rejections cannot speak for a new call.
const saveSteps = new WeakMap<object, { step: McpSaveStep; operation?: object }>();

export function attachMcpOperationStep(
  error: unknown,
  step: McpSaveStep,
  operation?: object,
): void {
  if (error && typeof error === 'object' && !saveSteps.has(error))
    saveSteps.set(error, { step, operation });
}

export function readMcpOperationStep(error: unknown, operation?: object): McpSaveStep | undefined {
  const marker = error && typeof error === 'object' ? saveSteps.get(error) : undefined;
  return marker && (operation === undefined || marker.operation === operation)
    ? marker.step
    : undefined;
}

export const attachMcpSaveStep = attachMcpOperationStep;
export const readMcpSaveStep = readMcpOperationStep;
