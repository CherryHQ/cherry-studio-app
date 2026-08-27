import { fnv1a32 } from '@cherrystudio/universal/utils/fnv1a';
import * as z from 'zod';

import type {
  RuntimeError,
  RuntimeJsonValue,
  RuntimeTool,
  RuntimeToolCall,
  RuntimeToolRef,
} from '@/backend/ai/agent';
import { raceAbort } from '@/backend/ai/agent/runtime/raceAbort';

export const MCP_TOOL_CALL_TIMEOUT_MS = 60 * 1000;
export const MCP_TOOL_RESULT_MAX_BYTES = 256 * 1024;

const MCP_PROVIDER_NAME_MAX_LENGTH = 63;
const MCP_RESULT_PREVIEW_MAX_BYTES = 8 * 1024;
const MCP_RESULT_PREVIEW_MAX_DEPTH = 5;
const MCP_RESULT_PREVIEW_MAX_ENTRIES = 12;
const MCP_RESULT_PREVIEW_MAX_STRING_BYTES = 512;
const UTF8_ENCODER = new TextEncoder();

export type McpExecutableToolDescriptor = {
  serverId: string;
  rawToolName: string;
  displayName: string;
  description: string;
  inputSchema: RuntimeJsonValue;
  /**
   * The endpoint this catalog was discovered against. Execution is pinned to
   * it: editing the server row must fail the frozen tool as unavailable, never
   * silently retarget the approved call to a new remote authority.
   */
  endpointUrl: string;
  /** Monotonic identity of the live catalog that produced this descriptor. */
  generation: number;
};

export type McpRuntimeToolSelection = {
  descriptor: McpExecutableToolDescriptor;
  approval: 'ask' | 'deny';
};

export type McpToolInvocationCapability = {
  invoke(
    ref: Extract<RuntimeToolRef, { source: 'mcp' }>,
    input: RuntimeJsonValue,
    signal: AbortSignal,
    discoveredEndpointUrl: string,
    discoveredGeneration: number,
  ): Promise<unknown>;
};

type McpRuntimeToolErrorCode =
  | 'mcp_tool_cancelled'
  | 'mcp_tool_call_failed'
  | 'mcp_tool_input_invalid'
  | 'mcp_tool_result_invalid'
  | 'mcp_tool_timeout'
  | 'mcp_tool_unavailable';

/** Stable, secret-free failure surface consumed by the Runtime adapter. */
export class McpRuntimeToolError extends Error implements RuntimeError {
  readonly code: McpRuntimeToolErrorCode;
  readonly retryable: boolean;

  constructor(code: McpRuntimeToolErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = 'McpRuntimeToolError';
    this.code = code;
    this.retryable = retryable;
    // Native stacks can contain endpoints, headers, or other private transport details.
    this.stack = undefined;
  }
}

export function createMcpProviderName(ref: Extract<RuntimeToolRef, { source: 'mcp' }>): string {
  const identity = `${ref.source}\0${ref.serverId}\0${ref.rawToolName}`;
  const digest = fnv1a32(identity).toString(36).padStart(7, '0');
  const readableName =
    ref.rawToolName.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'tool';
  const prefix = 'mcp_';
  const readableLimit = MCP_PROVIDER_NAME_MAX_LENGTH - prefix.length - digest.length - 1;

  return `${prefix}${readableName.slice(0, readableLimit)}_${digest}`;
}

/**
 * Clone and compile an MCP input schema while keeping the exposed value plain JSON.
 * Unsupported or non-JSON schemas fail before a Runtime tool can be created.
 */
export function prepareMcpInputSchema(value: unknown): RuntimeJsonValue {
  return compileMcpInputSchema(value).inputSchema;
}

function compileMcpInputSchema(value: unknown): {
  inputSchema: RuntimeJsonValue;
  inputValidator: z.ZodType;
} {
  if (!isRuntimeJsonValue(value) || Array.isArray(value) || value === null) {
    throw invalidSchemaError();
  }

  const inputSchema = JSON.parse(JSON.stringify(value)) as RuntimeJsonValue;
  try {
    return {
      inputSchema,
      inputValidator: z.fromJSONSchema(inputSchema as Parameters<typeof z.fromJSONSchema>[0]),
    };
  } catch {
    throw invalidSchemaError();
  }
}

/**
 * Adapt selected MCP descriptors into process-local Runtime tools.
 * The callback closes over only a compiled validator, the stable ref, and a narrow invoke method.
 */
export function createMcpRuntimeTools(
  selections: readonly McpRuntimeToolSelection[],
  capability: McpToolInvocationCapability,
): RuntimeTool[] {
  const identities = new Set<string>();
  const providerNames = new Set<string>();
  const invoke = capability.invoke.bind(capability);

  return selections.map(({ approval, descriptor }) => {
    if (
      !descriptor.serverId ||
      !descriptor.rawToolName ||
      !descriptor.endpointUrl ||
      !Number.isSafeInteger(descriptor.generation) ||
      descriptor.generation < 0
    ) {
      throw new McpRuntimeToolError(
        'mcp_tool_unavailable',
        'The MCP tool catalog contains an invalid tool identity.',
        false,
      );
    }
    const ref = {
      source: 'mcp',
      serverId: descriptor.serverId,
      rawToolName: descriptor.rawToolName,
    } as const;
    const identity = `${ref.source}\0${ref.serverId}\0${ref.rawToolName}`;
    if (identities.has(identity)) {
      throw new McpRuntimeToolError(
        'mcp_tool_unavailable',
        'The MCP tool catalog contains a duplicate tool identity.',
        false,
      );
    }
    identities.add(identity);

    const providerName = createMcpProviderName(ref);
    if (providerNames.has(providerName)) {
      throw new McpRuntimeToolError(
        'mcp_tool_unavailable',
        'The MCP tool catalog contains a provider name collision.',
        false,
      );
    }
    providerNames.add(providerName);

    const { inputSchema, inputValidator } = compileMcpInputSchema(descriptor.inputSchema);
    const endpointUrl = descriptor.endpointUrl;
    const generation = descriptor.generation;

    return {
      approval,
      description: descriptor.description,
      displayName: descriptor.displayName,
      execute: (call) =>
        executeMcpRuntimeTool({ call, endpointUrl, generation, inputValidator, invoke, ref }),
      inputSchema,
      providerName,
      ref,
    };
  });
}

async function executeMcpRuntimeTool(input: {
  call: RuntimeToolCall;
  endpointUrl: string;
  generation: number;
  inputValidator: z.ZodType;
  invoke: McpToolInvocationCapability['invoke'];
  ref: Extract<RuntimeToolRef, { source: 'mcp' }>;
}) {
  const { call } = input;
  if (call.signal.aborted) {
    throw cancelledError();
  }
  if (!input.inputValidator.safeParse(call.input).success) {
    throw new McpRuntimeToolError(
      'mcp_tool_input_invalid',
      'The MCP tool input did not match its JSON Schema.',
      false,
    );
  }

  const bound = createBoundedSignal(MCP_TOOL_CALL_TIMEOUT_MS, call.signal);
  try {
    const remoteResult = await raceAbort(
      input.invoke(input.ref, call.input, bound.signal, input.endpointUrl, input.generation),
      bound.signal,
    );
    if (bound.didTimeout()) {
      throw timeoutError();
    }
    if (call.signal.aborted) {
      throw cancelledError();
    }

    return { artifacts: [], value: projectMcpResult(remoteResult) };
  } catch (error) {
    if (bound.didTimeout()) {
      throw timeoutError();
    }
    if (call.signal.aborted) {
      throw cancelledError();
    }
    if (error instanceof McpRuntimeToolError) {
      throw error;
    }
    throw new McpRuntimeToolError('mcp_tool_call_failed', 'The MCP tool call failed.', true);
  } finally {
    bound.done();
  }
}

function projectMcpResult(value: unknown): RuntimeJsonValue {
  let serialized: string | undefined;
  let projected: RuntimeJsonValue;
  try {
    serialized = JSON.stringify(value);
    projected = serialized === undefined ? null : (JSON.parse(serialized) as RuntimeJsonValue);
  } catch {
    throw new McpRuntimeToolError(
      'mcp_tool_result_invalid',
      'The MCP tool returned a non-JSON result.',
      false,
    );
  }

  const originalByteSize = utf8Size(serialized ?? 'null');
  if (originalByteSize <= MCP_TOOL_RESULT_MAX_BYTES) {
    return projected;
  }

  let preview = createBoundedPreview(projected, 0);
  if (utf8Size(JSON.stringify(preview)) > MCP_RESULT_PREVIEW_MAX_BYTES) {
    preview = '[MCP result preview omitted]';
  }

  return { originalByteSize, preview, truncated: true };
}

function createBoundedPreview(value: RuntimeJsonValue, depth: number): RuntimeJsonValue {
  if (typeof value === 'string') {
    const byteSize = utf8Size(value);
    if (isLikelyBinaryString(value)) {
      return `[binary string omitted: ${byteSize} bytes]`;
    }
    if (byteSize > MCP_RESULT_PREVIEW_MAX_STRING_BYTES) {
      return `${truncateUtf8(value, MCP_RESULT_PREVIEW_MAX_STRING_BYTES)}…`;
    }
    return value;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (depth >= MCP_RESULT_PREVIEW_MAX_DEPTH) {
    return '[nested value omitted]';
  }
  if (Array.isArray(value)) {
    const preview = value
      .slice(0, MCP_RESULT_PREVIEW_MAX_ENTRIES)
      .map((item) => createBoundedPreview(item, depth + 1));
    if (value.length > MCP_RESULT_PREVIEW_MAX_ENTRIES) {
      preview.push(`[${value.length - MCP_RESULT_PREVIEW_MAX_ENTRIES} more items omitted]`);
    }
    return preview;
  }

  const entries = Object.entries(value);
  const preview = Object.fromEntries(
    entries
      .slice(0, MCP_RESULT_PREVIEW_MAX_ENTRIES)
      .map(([key, item]) => [key, createBoundedPreview(item, depth + 1)]),
  );
  if (entries.length > MCP_RESULT_PREVIEW_MAX_ENTRIES) {
    preview._omitted = `${entries.length - MCP_RESULT_PREVIEW_MAX_ENTRIES} more fields`;
  }
  return preview;
}

function isLikelyBinaryString(value: string): boolean {
  if (value.startsWith('data:')) {
    return true;
  }
  return value.length >= 256 && value.length % 4 === 0 && /^[a-zA-Z0-9+/=_-]+$/.test(value);
}

function truncateUtf8(value: string, maxBytes: number): string {
  let result = '';
  let byteSize = 0;
  for (const character of value) {
    const characterBytes = utf8Size(character);
    if (byteSize + characterBytes > maxBytes) {
      break;
    }
    result += character;
    byteSize += characterBytes;
  }
  return result;
}

function utf8Size(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}

function isRuntimeJsonValue(value: unknown): value is RuntimeJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isRuntimeJsonValue);
  }
  if (typeof value !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  return Object.values(value).every(isRuntimeJsonValue);
}

function invalidSchemaError(): McpRuntimeToolError {
  return new McpRuntimeToolError(
    'mcp_tool_unavailable',
    'The MCP tool has an invalid JSON Schema.',
    false,
  );
}

function cancelledError(): McpRuntimeToolError {
  return new McpRuntimeToolError('mcp_tool_cancelled', 'The MCP tool call was cancelled.', false);
}

function timeoutError(): McpRuntimeToolError {
  return new McpRuntimeToolError('mcp_tool_timeout', 'The MCP tool call timed out.', true);
}

export type BoundedSignal = {
  didTimeout: () => boolean;
  done: () => void;
  signal: AbortSignal;
};

/** Compose one timer with upstream AbortSignals using Expo's patched AbortSignal.any. */
export function createBoundedSignal(
  timeoutMs: number,
  ...upstream: readonly AbortSignal[]
): BoundedSignal {
  const timeoutController = new AbortController();
  let timedOut = false;
  const handle = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, timeoutMs);

  return {
    didTimeout: () => timedOut,
    done: () => clearTimeout(handle),
    signal:
      upstream.length === 0
        ? timeoutController.signal
        : AbortSignal.any([timeoutController.signal, ...upstream]),
  };
}
