import { fnv1a32 } from '@cherrystudio/universal/utils/fnv1a';
import * as z from 'zod';

import type {
  RuntimeError,
  RuntimeJsonValue,
  RuntimeTool,
  RuntimeToolCall,
  RuntimeToolRef,
  RuntimeToolResult,
} from '@/backend/ai/agent';
import { raceAbort } from '@/backend/utils/raceAbort';
import { projectMcpModelContent } from '@/shared/contracts/mcpContent';
import type { PluginErrorReason } from '@/shared/contracts/plugins';

import type { TraceRecorder } from '../observability';
import { endMcpTrace } from './endMcpTrace';

export const MCP_TOOL_CALL_TIMEOUT_MS = 60 * 1000;
export const MCP_TOOL_RESULT_MAX_BYTES = 256 * 1024;

const MCP_PROVIDER_NAME_MAX_LENGTH = 63;
const MCP_RESULT_PREVIEW_MAX_BYTES = 8 * 1024;
const MCP_RESULT_PREVIEW_MAX_DEPTH = 5;
const MCP_RESULT_PREVIEW_MAX_ENTRIES = 12;
const MCP_RESULT_PREVIEW_MAX_STRING_BYTES = 512;
const UTF8_ENCODER = new TextEncoder();

export type McpExecutableToolDescriptor = {
  connectionKey?: string;
  app?: import('@/shared/contracts/mcpApp').McpAppReference;
  serverId: string;
  /** Bundled identity from the server record, never inferred from remote descriptions or names. */
  pluginId?: string;
  rawToolName: string;
  displayName: string;
  description: string;
  inputSchema: RuntimeJsonValue;
  /**
   * What a failure after transmission means. `read`: repeating the call is harmless, from
   * bundled policy or a remote read-only or idempotent annotation. `write`: a bundled write.
   * Absent: the remote server declared nothing, so the outcome is unknown.
   */
  effect?: 'read' | 'write';
  /**
   * The endpoint this catalog was discovered against. Execution is pinned to
   * it: editing the server row must fail the frozen tool as unavailable, never
   * silently retarget the approved call to a new remote authority.
   */
  endpointUrl: string | null;
  /**
   * Monotonic identity of the catalog that produced this descriptor. It is
   * replaced when the server is invalidated, never by a transport reconnect for
   * the same configuration, so a frozen tool stays callable across a reconnect.
   */
  generation: number;
};

export type McpRuntimeToolSelection = {
  workspaceFolderId?: string | null;
  descriptor: McpExecutableToolDescriptor;
  approval: 'ask' | 'deny';
};

/** An image the importer saved as a managed file, with the bytes for the current request. */
export type McpRetainedImage = { data: string; mediaType: string; fileEntryId: string };

/** What an invocation reports back while it runs. */
export type McpInvocationProgress = {
  /** The request is about to leave the device; a later failure no longer proves it did not run. */
  sent(): void;
  /** Human consent is in progress, which pauses the active network budget. */
  waiting(active: boolean): void;
};

export type McpToolInvocationCapability = {
  traces?: TraceRecorder;
  storeResult?(
    result: unknown,
    signal: AbortSignal,
    workspaceFolderId?: string | null,
  ): Promise<{
    value: unknown;
    artifacts: import('../agent/runtime/types').RuntimeArtifact[];
    images?: McpRetainedImage[];
    /** Managed file holding model text that exceeded the model budget. */
    fullTextFileEntryId?: string;
  }>;
  invoke(
    ref: Extract<RuntimeToolRef, { source: 'mcp' }>,
    input: RuntimeJsonValue,
    signal: AbortSignal,
    discoveredEndpointUrl: string | null,
    discoveredGeneration: number,
    progress: McpInvocationProgress,
  ): Promise<unknown>;
};

type McpRuntimeToolErrorCode =
  | 'mcp_tool_cancelled'
  | 'mcp_tool_call_failed'
  | 'mcp_tool_input_invalid'
  | 'mcp_tool_outcome_unknown'
  | 'mcp_tool_result_invalid'
  | 'mcp_tool_timeout'
  | 'mcp_tool_write_outcome_unknown'
  | 'mcp_tool_unavailable';

/** Stable, secret-free failure surface consumed by the Runtime adapter. */
export class McpRuntimeToolError extends Error implements RuntimeError {
  readonly code: McpRuntimeToolErrorCode;
  readonly retryable: boolean;

  constructor(
    code: McpRuntimeToolErrorCode,
    message: string,
    retryable: boolean,
    public readonly context?: {
      pluginReason: PluginErrorReason;
      statusCode?: number;
      providerCode?: number;
    },
  ) {
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
 * The callback owns the compiled validator, stable ref, invocation port, and optional diagnostics.
 */
export function createMcpRuntimeTools(
  selections: readonly McpRuntimeToolSelection[],
  capability: McpToolInvocationCapability,
): RuntimeTool[] {
  const identities = new Set<string>();
  const providerNames = new Set<string>();
  const invoke = capability.invoke.bind(capability);

  return selections.map(({ approval, descriptor, workspaceFolderId }) => {
    if (
      !descriptor.serverId ||
      !descriptor.rawToolName ||
      (descriptor.endpointUrl !== null && !descriptor.endpointUrl) ||
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
    const effect = descriptor.effect;
    const endpointUrl = descriptor.endpointUrl;
    const generation = descriptor.generation;

    return {
      approval,
      description: descriptor.description,
      displayName: descriptor.displayName,
      execute: (call) =>
        executeMcpRuntimeTool({
          call,
          workspaceFolderId,
          app: descriptor.app,
          connectionKey: descriptor.connectionKey,
          pluginId: descriptor.pluginId,
          effect,
          endpointUrl,
          generation,
          inputValidator,
          invoke,
          storeResult: capability.storeResult,
          ref,
          traces: capability.traces,
        }),
      inputSchema,
      providerName,
      ref,
      // Only a bundled plugin's own policy is trusted to declare a read.
      ...(descriptor.pluginId && effect ? { effect } : {}),
    };
  });
}

async function executeMcpRuntimeTool(input: {
  workspaceFolderId?: string | null;
  connectionKey?: string;
  call: RuntimeToolCall;
  app?: McpExecutableToolDescriptor['app'];
  pluginId?: string;
  effect: McpExecutableToolDescriptor['effect'];
  endpointUrl: string | null;
  generation: number;
  inputValidator: z.ZodType;
  invoke: McpToolInvocationCapability['invoke'];
  storeResult?: McpToolInvocationCapability['storeResult'];
  ref: Extract<RuntimeToolRef, { source: 'mcp' }>;
  traces?: TraceRecorder;
}) {
  const { call } = input;
  const trace = input.traces?.startTrace('mcp.call_tool', undefined, {
    'mcp.server.id': input.ref.serverId,
    'plugin.id': input.pluginId,
    'mcp.connection.generation': input.generation,
    'tool.name': input.ref.rawToolName,
    'tool.call.id': call.toolCallId,
  });
  let bound: BoundedSignal | undefined;
  let sent = false;
  const incomplete = () =>
    incompleteCallError({
      cancelled: call.signal.aborted,
      effect: input.effect,
      sent,
      timedOut: bound?.didTimeout() ?? false,
    });
  try {
    if (call.signal.aborted) throw cancelledError();
    if (!input.inputValidator.safeParse(call.input).success) {
      throw new McpRuntimeToolError(
        'mcp_tool_input_invalid',
        'The MCP tool input did not match its JSON Schema.',
        false,
      );
    }
    bound = createBoundedSignal(MCP_TOOL_CALL_TIMEOUT_MS, call.signal);
    const remoteResult = await raceAbort(
      input.invoke(input.ref, call.input, bound.signal, input.endpointUrl, input.generation, {
        sent: () => {
          sent = true;
        },
        waiting: (active) => bound?.setPaused(active),
      }),
      bound.signal,
    );
    if (bound.didTimeout() || call.signal.aborted) throw incomplete();

    const stored: {
      value: unknown;
      artifacts: RuntimeToolResult['artifacts'];
      images?: McpRetainedImage[];
      fullTextFileEntryId?: string;
    } = (await input.storeResult?.(remoteResult, call.signal, input.workspaceFolderId)) ?? {
      value: remoteResult,
      artifacts: [],
    };
    const value = projectMcpResult(stored.value);
    const isToolError =
      remoteResult !== null &&
      typeof remoteResult === 'object' &&
      'isError' in remoteResult &&
      remoteResult.isError === true;
    trace?.end(
      isToolError ? 'error' : 'ok',
      isToolError ? { 'error.category': 'tool_result' } : undefined,
    );
    return {
      artifacts: stored.artifacts,
      value,
      modelContent: projectMcpModelContent(
        remoteResult,
        stored.fullTextFileEntryId
          ? `Full text: read_file with file_entry_id ${stored.fullTextFileEntryId}, paging with start_line and limit.`
          : undefined,
      ).flatMap((block): NonNullable<RuntimeToolResult['modelContent']> => {
        if (block.type === 'text') return [block];
        const image = stored.images?.find(
          (item) => item.data === block.data && item.mediaType === block.mimeType,
        );
        return image
          ? [{ type: 'image', fileEntryId: image.fileEntryId, mimeType: block.mimeType }]
          : [{ type: 'text', text: '[MCP image could not be retained as a managed attachment]' }];
      }),
      ...(stored.images?.length ? { modelImages: stored.images } : {}),
      ...(input.app ? { mcpApp: input.app } : {}),
      ...(input.connectionKey
        ? { mcpSource: { serverId: input.ref.serverId, connectionKey: input.connectionKey } }
        : {}),
    };
  } catch (error) {
    endMcpTrace(trace, error, call.signal, bound?.didTimeout());
    // Preserve classified failures, including rejections before transmission.
    if (error instanceof McpRuntimeToolError) {
      throw error;
    }
    throw incomplete();
  } finally {
    bound?.done();
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

/**
 * A call that ended without a classified result. Before transmission, or for a call that is
 * harmless to repeat, the failure is exact. After transmission the SDK may still fail while
 * reading the body, or this boundary may time out before invoke() settles; neither proves
 * the service did nothing.
 */
export function incompleteCallError(call: {
  cancelled: boolean;
  effect: McpExecutableToolDescriptor['effect'];
  sent: boolean;
  timedOut: boolean;
}): McpRuntimeToolError {
  if (!call.sent || call.effect === 'read') {
    if (call.timedOut) return timeoutError();
    if (call.cancelled) return cancelledError();
    return new McpRuntimeToolError('mcp_tool_call_failed', 'The MCP tool call failed.', true);
  }
  if (call.effect === 'write') return unknownWriteError();
  // Cancellation stops local waiting; an undeclared remote effect may already have happened.
  return new McpRuntimeToolError(
    'mcp_tool_outcome_unknown',
    'The MCP tool call did not complete, so its outcome is unknown. Retry only if repeating it is harmless; otherwise check the service first.',
    false,
  );
}

function unknownWriteError(): McpRuntimeToolError {
  return new McpRuntimeToolError(
    'mcp_tool_write_outcome_unknown',
    'The write outcome could not be confirmed. Check the service before retrying.',
    false,
  );
}

export type BoundedSignal = {
  setPaused: (active: boolean) => void;
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
  let remaining = timeoutMs;
  let started = Date.now();
  let handle: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  let pauseDepth = 0;
  const start = () => {
    started = Date.now();
    handle = setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, remaining);
  };
  start();

  return {
    didTimeout: () => timedOut,
    setPaused(active) {
      if (finished || timedOut) return;
      // A modern input-required round can ask several questions concurrently.
      pauseDepth = active ? pauseDepth + 1 : Math.max(0, pauseDepth - 1);
      if (pauseDepth > 0 && handle !== undefined) {
        clearTimeout(handle);
        handle = undefined;
        remaining = Math.max(0, remaining - (Date.now() - started));
      } else if (pauseDepth === 0 && handle === undefined) start();
    },
    done: () => {
      finished = true;
      clearTimeout(handle);
    },
    signal:
      upstream.length === 0
        ? timeoutController.signal
        : AbortSignal.any([timeoutController.signal, ...upstream]),
  };
}
