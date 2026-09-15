import type {
  AgentContext as PiAgentContext,
  AgentEvent as PiAgentEvent,
  AgentMessage as PiAgentMessage,
  AgentTool as PiAgentTool,
} from '@earendil-works/pi-agent-core';
import type { AgentOptions } from '@earendil-works/pi-agent-core/agent';
import { estimateTokens } from '@earendil-works/pi-agent-core/compaction';
import type {
  Api as PiApi,
  AssistantMessage,
  Message as PiMessage,
  Model as PiModel,
  Models,
  ModelThinkingLevel,
  ToolResultMessage,
  Usage as PiUsage,
} from '@earendil-works/pi-ai';

import { normalizeAiError } from '@/backend/ai/normalizeAiError';

import { raceAbort, settleWithin } from '../raceAbort';
import { RuntimeEventChannel } from '../RuntimeEventChannel';
import { RuntimeJsonValueSchema } from '../runtimeSchemas';
import {
  createDeniedToolResult,
  createErrorToolResult,
  createInterruptedToolResult,
  TOOL_EXECUTION_ERROR,
} from '../toolResults';
import type {
  AgentRuntime,
  AgentRuntimeSession,
  MessageRuntimeTimingSink,
  RuntimeDescriptor,
  RuntimeDocumentAttachmentPart,
  RuntimeError,
  RuntimeEvent,
  RuntimeExecutionRequest,
  RuntimeJsonValue,
  RuntimeMessageToolRef,
  RuntimeModel,
  RuntimeModelPreflight,
  RuntimeOutputPart,
  RuntimeTool,
  RuntimeToolInputPreview,
  RuntimeToolResult,
  RuntimeTextAttachmentPart,
  RuntimeUsage,
  RuntimeUsageContext,
} from '../types';
import {
  estimatePiLoopContextHeadroomTokens,
  estimatePiMessagesTokens,
  PI_ESTIMATED_CHARACTERS_PER_TOKEN,
  planPiContext,
  type PiContextCompactionOptions,
} from './contextCompaction';
import { toPiConversation } from './modelMessages';
import {
  createPiDispatchActivityInput,
  createPiDeferredToolDiscoveryTools,
  PI_DEFERRED_TOOL_DISCOVERY_SYSTEM_PROMPT,
  PI_TOOL_CALL_TOOL_NAME,
  type PiMetaToolActivity,
  type PiMetaToolExecution,
} from './piDeferredToolDiscovery';
import { disablePiToolCalls } from './piToolChoice';
import { PiToolInputPreviewBuffer } from './PiToolInputPreviewBuffer';
import { tracePiStream } from './tracePiStream';

export type PiModelResolution = {
  defaultThinkingLevel: ModelThinkingLevel;
  /** Independent provider input cap, before reserving this request's output. */
  maxInputTokens?: number;
  model: PiModel<PiApi>;
  redactionValues: readonly string[];
  streamFn: AgentOptions['streamFn'];
  supportsTools: boolean;
  usageContext: RuntimeUsageContext;
};

export interface PiRuntimeDependencies {
  preflightModel(model: RuntimeModel): RuntimeModelPreflight | Promise<RuntimeModelPreflight>;
  resolveModel(
    model: RuntimeExecutionRequest['model'],
    options: RuntimeExecutionRequest['options'],
  ): PiModelResolution | Promise<PiModelResolution>;
}

export type PiRuntimeContextOptions = PiContextCompactionOptions & {
  completeSimple?: Models['completeSimple'];
};

export type PiRuntimeAgent = {
  abort(): void;
  prompt(message: PiMessage | PiMessage[]): Promise<void>;
  subscribe(
    listener: (event: PiAgentEvent, signal: AbortSignal) => Promise<void> | void,
  ): () => void;
  waitForIdle(): Promise<void>;
};
export type PiRuntimeAgentFactory = (options: AgentOptions) => PiRuntimeAgent;

const PI_DESCRIPTOR: RuntimeDescriptor = {
  id: 'pi',
  name: 'Pi Runtime',
  capabilities: {
    approvals: true,
    attachments: true,
    reasoning: true,
    tools: true,
  },
};

const DENIED_TOOL_RESULT = createDeniedToolResult('The user denied this tool call.');
const INTERRUPTED_TOOL_REASON = 'The turn ended before this tool call completed.';

export type PiRuntimeLimits = {
  maxToolCalls: number;
  maxToolSteps: number;
  turnTimeoutMs: number;
};

export const DEFAULT_PI_RUNTIME_LIMITS: PiRuntimeLimits = Object.freeze({
  maxToolCalls: 64,
  maxToolSteps: 20,
  turnTimeoutMs: 10 * 60 * 1000,
});

const TOOL_BUDGET_FINAL_RESPONSE_INSTRUCTIONS =
  'The tool budget for this turn is exhausted. Tools are now unavailable. ' +
  'Give your final answer using the information already collected. ' +
  'Clearly state any remaining uncertainty or unfinished work; do not invent results or request more tools.';

const TOOL_CALL_LIMIT_ERROR: RuntimeError = {
  code: 'tool_call_limit_exceeded',
  message: 'The turn reached its tool call limit.',
  retryable: false,
  origin: 'runtime',
};
const TOOL_STEP_LIMIT_ERROR: RuntimeError = {
  code: 'tool_step_limit_exceeded',
  message: 'The turn reached its tool loop step limit.',
  retryable: false,
  origin: 'runtime',
};
const TOOL_LOOP_CONTEXT_ERROR: RuntimeError = {
  code: 'context_window_exceeded',
  message: 'The tool loop exhausted the model context window before the next request.',
  retryable: false,
  origin: 'runtime',
};
const TURN_TIMEOUT_ERROR: RuntimeError = {
  code: 'turn_timeout',
  message: 'The Agent turn timed out.',
  retryable: true,
  origin: 'runtime',
};
const DUPLICATE_TOOL_CALL_ERROR: RuntimeError = {
  code: 'duplicate_tool_call_id',
  message: 'The provider reused a tool call id while its approval was pending.',
  retryable: false,
  origin: 'provider',
};

/**
 * After `cancel()`/`close()` abort a turn, the underlying pi loop gets this
 * long to unwind before the Runtime settles the terminal outcome itself. The
 * loop's late settlement is then discarded by the terminal fence in `emit()`.
 * Keep it well below the Host's five-second service teardown ceiling.
 */
export const PI_TURN_SETTLE_GRACE_MS = 1_000;

const MAX_EXECUTION_ERROR_MESSAGE_CHARS = 4_000;
const MIN_USEFUL_META_TOOL_OUTPUT_CHARACTERS = 2_000;
const REDACTED_SECRET = '[REDACTED]';

const TERMINAL_ERROR_DIAGNOSTIC_TYPES = new Set([
  'pi_messages_response_failure',
  'provider_response_failure',
]);

type ApprovalWaiter = {
  reject(reason: Error): void;
  resolve(decision: 'approve' | 'deny'): void;
};

type ToolPartBase = {
  displayName: string;
  id: string;
  input?: RuntimeJsonValue;
  inputPreview?: RuntimeToolInputPreview;
  providerName: string;
  toolCallId: string;
  toolRef: RuntimeMessageToolRef;
};
type ToolPartInitialState = 'input-streaming' | 'input-available';

type PiToolBinding =
  | { kind: 'runtime'; runtimeTool: RuntimeTool }
  | { kind: 'meta'; displayName: string; providerName: string }
  | { kind: 'dispatch'; displayName: string; providerName: string };

/**
 * Turn lifecycle. The first transition out of `running` wins the phase — it is
 * never retargeted — and only the terminal fence in `emit()` reaches
 * `terminated`. The published terminal event is a separate concern: during
 * `timing-out` the run loop's timeout failure still races the unconditional
 * `cancelled` from `cancel()`/`close()`, and the fence keeps whichever lands
 * first.
 */
type TurnPhase = 'running' | 'cancelling' | 'timing-out' | 'terminated';

type ActiveTurn = {
  abortController: AbortController;
  agent?: PiRuntimeAgent;
  approvalWaiters: Map<string, ApprovalWaiter>;
  channel: RuntimeEventChannel;
  currentMessageOrdinal?: number;
  dispatchCalls: Map<string, RuntimeJsonValue>;
  failedToolCalls: Set<string>;
  recordedInvocations: Set<string>;
  recordedResponses: WeakSet<AssistantMessage>;
  nextInvocationOrdinal: number;
  unavailableTools: Map<string, RuntimeToolResult>;
  limitError?: RuntimeError;
  modelContextHeadroomTokens: number;
  nextMessageOrdinal: number;
  nextPartIndex: number;
  phase: TurnPhase;
  runtimeTimingSink?: MessageRuntimeTimingSink;
  settledToolCalls: Set<string>;
  streamingToolCalls: Set<string>;
  inputPreviews: PiToolInputPreviewBuffer;
  terminalMessage?: AssistantMessage;
  timeoutHandle?: ReturnType<typeof setTimeout>;
  toolCallCount: number;
  toolBudgetError?: RuntimeError;
  toolBindingsByProviderName: Map<string, PiToolBinding>;
  toolParts: Map<string, ToolPartBase>;
  tools: readonly RuntimeTool[];
  toolStepCount: number;
  turnId: string;
  usageContext?: RuntimeUsageContext;
};

async function createDefaultAgent(options: AgentOptions): Promise<PiRuntimeAgent> {
  const { Agent } = await import('@earendil-works/pi-agent-core/agent');
  return new Agent(options);
}

function validateRequest(request: RuntimeExecutionRequest): RuntimeError | null {
  const inputAndHistoryParts = [
    ...request.input,
    ...request.history.flatMap((turn) => turn.messages.flatMap((message) => message.parts)),
  ];
  const files = inputAndHistoryParts.filter((part) => part.type === 'file');
  if (files.some((part) => !isInlineImagePart(part))) {
    return {
      code: 'unsupported_input',
      message: 'Pi Runtime accepts only validated inline image attachments.',
      retryable: false,
    };
  }
  const textAttachments = inputAndHistoryParts.filter((part) => part.type === 'text-attachment');
  const documentAttachments = inputAndHistoryParts.filter(
    (part) => part.type === 'document-attachment',
  );
  const hasNonUserHistoricalContentAttachment = request.history.some((turn) =>
    turn.messages.some(
      (message) =>
        message.role !== 'user' &&
        message.parts.some(
          (part) => part.type === 'text-attachment' || part.type === 'document-attachment',
        ),
    ),
  );
  if (
    hasNonUserHistoricalContentAttachment ||
    textAttachments.some((part) => !isValidatedTextAttachment(part)) ||
    documentAttachments.some((part) => !isValidatedDocumentAttachment(part))
  ) {
    return {
      code: 'unsupported_input',
      message: 'Pi Runtime accepts only validated untrusted content attachments in user input.',
      retryable: false,
    };
  }
  return null;
}

function isInlineImagePart(part: { mediaType: string; uri: string }): boolean {
  return (
    typeof part.mediaType === 'string' &&
    typeof part.uri === 'string' &&
    part.mediaType.startsWith('image/') &&
    part.uri.startsWith(`data:${part.mediaType};base64,`) &&
    part.uri.length > `data:${part.mediaType};base64,`.length
  );
}

function isValidatedDocumentAttachment(part: RuntimeDocumentAttachmentPart): boolean {
  if (
    typeof part.fileEntryId !== 'string' ||
    !part.fileEntryId ||
    typeof part.mediaType !== 'string' ||
    !part.mediaType.includes('/') ||
    typeof part.name !== 'string' ||
    !part.name ||
    /[/\\\0]/u.test(part.name) ||
    part.trust !== 'untrusted-user-content' ||
    part.parser !== 'anydoc' ||
    typeof part.parserVersion !== 'string' ||
    !part.parserVersion ||
    !Number.isSafeInteger(part.totalCharacters) ||
    part.totalCharacters < 0 ||
    !part.document ||
    !Array.isArray(part.images) ||
    !Array.isArray(part.assetDelivery)
  )
    return false;
  if (part.document.delivery === 'complete') {
    const result = part.document.result;
    if (
      !result ||
      result.status !== 'ok' ||
      !Array.isArray(result.warnings) ||
      result.warnings.some((warning) => typeof warning !== 'string') ||
      !RuntimeJsonValueSchema.safeParse(result.ir).success
    )
      return false;
  } else if (part.document.delivery !== 'deferred') return false;
  const sentRefs = new Map<string, string>();
  for (const asset of part.assetDelivery) {
    if (
      !asset ||
      typeof asset.assetRef !== 'string' ||
      !asset.assetRef ||
      (asset.contentType !== null && typeof asset.contentType !== 'string') ||
      !Number.isSafeInteger(asset.size) ||
      asset.size < 0 ||
      !['sent', 'model-unsupported', 'unsupported-type', 'budget'].includes(asset.status)
    )
      return false;
    if (asset.status === 'sent') {
      if (!asset.contentType || sentRefs.has(asset.assetRef)) return false;
      sentRefs.set(asset.assetRef, asset.contentType.toLowerCase());
    }
  }
  for (const image of part.images) {
    if (!image || !isInlineImagePart(image) || sentRefs.get(image.assetRef) !== image.mediaType)
      return false;
    sentRefs.delete(image.assetRef);
  }
  return sentRefs.size === 0;
}

function isValidatedTextAttachment(part: RuntimeTextAttachmentPart): boolean {
  return (
    typeof part.mediaType === 'string' &&
    part.mediaType.includes('/') &&
    typeof part.name === 'string' &&
    part.name.length > 0 &&
    !/[/\\\0]/u.test(part.name) &&
    typeof part.text === 'string' &&
    typeof part.truncated === 'boolean' &&
    part.trust === 'untrusted-user-content'
  );
}

function diagnosticResponseBody(details: Record<string, unknown> | undefined): string | undefined {
  if (typeof details?.responseBody === 'string') return details.responseBody;
  if (typeof details?.body === 'string') return details.body;
  if (details?.error === undefined) return undefined;
  try {
    return JSON.stringify(details.error);
  } catch {
    return undefined;
  }
}

function terminalExecutionError(message: AssistantMessage): unknown {
  const diagnostics = message.diagnostics ?? [];
  for (let index = diagnostics.length - 1; index >= 0; index -= 1) {
    const diagnostic = diagnostics[index];
    if (!diagnostic?.error || !TERMINAL_ERROR_DIAGNOSTIC_TYPES.has(diagnostic.type)) continue;
    const details = diagnostic.details;
    const statusCode = details?.statusCode ?? details?.status;
    const responseBody = diagnosticResponseBody(details);
    return {
      message: message.errorMessage ?? diagnostic.error.message,
      ...(diagnostic.error.code !== undefined ? { code: String(diagnostic.error.code) } : {}),
      ...(diagnostic.error.name ? { name: diagnostic.error.name } : {}),
      ...(statusCode !== undefined ? { statusCode } : {}),
      ...(typeof details?.retryable === 'boolean' ? { retryable: details.retryable } : {}),
      ...(message.rawStopReason ? { finishReason: message.rawStopReason } : {}),
      ...(responseBody ? { responseBody } : {}),
    };
  }
  return message.errorMessage;
}

function normalizeToolExecutionError(error: unknown): RuntimeError {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    typeof error.code !== 'string' ||
    !('message' in error) ||
    typeof error.message !== 'string' ||
    !('retryable' in error) ||
    typeof error.retryable !== 'boolean'
  ) {
    return TOOL_EXECUTION_ERROR;
  }

  const stackStart = error.message.search(/\n\s+at\s+/);
  const message = (stackStart >= 0 ? error.message.slice(0, stackStart) : error.message)
    .trim()
    .slice(0, MAX_EXECUTION_ERROR_MESSAGE_CHARS);
  return {
    code: error.code.slice(0, 128) || TOOL_EXECUTION_ERROR.code,
    message: message || TOOL_EXECUTION_ERROR.message,
    retryable: error.retryable,
    origin: 'tool',
    ...('name' in error && typeof error.name === 'string'
      ? { name: error.name.trim().slice(0, 256) }
      : {}),
  };
}

function redactCompactionSummary(summary: string, sensitiveValues: readonly string[]): string {
  let redacted = summary.replace(
    /data:[^;,\s]+;base64,[a-z0-9+/=]+/gi,
    '[attachment content omitted]',
  );
  for (const value of [...new Set(sensitiveValues)].sort(
    (left, right) => right.length - left.length,
  )) {
    if (value) redacted = redacted.replaceAll(value, REDACTED_SECRET);
  }
  return redacted;
}

function sensitiveToolResultValues(messages: readonly PiMessage[]): string[] {
  const values: string[] = [];
  for (const message of messages) {
    if (message.role !== 'toolResult') continue;
    for (const part of message.content) {
      if (part.type === 'text' && part.text) values.push(part.text);
    }
    collectSensitiveValues(message.details, values);
  }
  return values;
}

function attachmentBodies(request: RuntimeExecutionRequest): string[] {
  const values: string[] = [];
  for (const part of [
    ...request.input,
    ...request.history.flatMap((turn) => turn.messages.flatMap((message) => message.parts)),
  ]) {
    if (part.type === 'text-attachment' && part.text) values.push(part.text);
    if (part.type !== 'document-attachment') continue;
    if (part.document.delivery === 'complete') {
      values.push(JSON.stringify(part.document.result), JSON.stringify(part.document.result.ir));
      collectSensitiveValues(part.document.result.ir, values, true);
      values.push(...part.document.result.warnings);
    }
    for (const image of part.images)
      values.push(image.uri, image.uri.slice(image.uri.indexOf(',') + 1));
  }
  return values;
}

function collectSensitiveValues(value: unknown, values: string[], sensitive = false): void {
  if (typeof value === 'string') {
    if (sensitive) values.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectSensitiveValues(item, values, sensitive);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    collectSensitiveValues(
      child,
      values,
      sensitive || /secret|token|password|credential|api.?key|authorization|cookie/i.test(key),
    );
  }
}

function toRuntimeUsage(usage: PiUsage): RuntimeUsage {
  const inputTokens = usage.input + usage.cacheRead + usage.cacheWrite;
  return {
    cacheReadTokens: usage.cacheRead,
    cacheWriteTokens: usage.cacheWrite,
    inputTokens,
    noCacheTokens: usage.input,
    outputTokens: usage.output,
    ...(usage.reasoning !== undefined ? { reasoningTokens: usage.reasoning } : {}),
    totalTokens: usage.totalTokens || inputTokens + usage.output,
  };
}

function resolveThinkingLevel(
  request: RuntimeExecutionRequest,
  resolution: PiModelResolution,
): ModelThinkingLevel {
  if (!resolution.model.reasoning) return 'off';
  const effort = request.options.reasoningEffort;
  if (effort === 'none') return 'off';
  if (effort === undefined || effort === 'default' || effort === 'auto') {
    return resolution.defaultThinkingLevel;
  }
  return effort;
}

function toRuntimeJson(value: unknown, fallback: RuntimeJsonValue = null): RuntimeJsonValue {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? fallback : (JSON.parse(serialized) as RuntimeJsonValue);
  } catch {
    return fallback;
  }
}

function toolResultOutput(result: ToolResultMessage): RuntimeJsonValue {
  if (result.details !== undefined) return toRuntimeJson(result.details);
  const text = result.content
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join('\n');
  return text || null;
}

class PiRuntimeSession implements AgentRuntimeSession {
  private activeTurn: ActiveTurn | undefined;
  private closed = false;

  constructor(
    private readonly dependencies: PiRuntimeDependencies,
    private readonly createAgent?: PiRuntimeAgentFactory,
    private readonly limits: PiRuntimeLimits = DEFAULT_PI_RUNTIME_LIMITS,
    private readonly contextOptions: PiRuntimeContextOptions = {},
  ) {}

  execute(request: RuntimeExecutionRequest): AsyncIterable<RuntimeEvent> {
    if (this.closed) throw new Error('Pi Runtime session is closed.');
    if (this.activeTurn) throw new Error('Pi Runtime permits only one active execute per session.');

    const channel = new RuntimeEventChannel();
    const validationError = validateRequest(request);
    if (validationError) {
      channel.push({ type: 'failed', error: validationError });
      channel.end();
      return channel.drain();
    }

    const turn: ActiveTurn = {
      abortController: new AbortController(),
      approvalWaiters: new Map(),
      channel,
      dispatchCalls: new Map(),
      failedToolCalls: new Set(),
      recordedInvocations: new Set(),
      recordedResponses: new WeakSet(),
      nextInvocationOrdinal: 0,
      unavailableTools: new Map(),
      modelContextHeadroomTokens: 0,
      nextMessageOrdinal: 0,
      nextPartIndex: 0,
      phase: 'running',
      runtimeTimingSink: request.runtimeTimingSink,
      settledToolCalls: new Set(),
      streamingToolCalls: new Set(),
      inputPreviews: new PiToolInputPreviewBuffer((toolCallId, preview) => {
        if (turn.phase !== 'running' || !turn.streamingToolCalls.has(toolCallId)) return;
        const part = turn.toolParts.get(toolCallId);
        if (!part) return;
        if (
          part.inputPreview?.text === preview.text &&
          part.inputPreview.name === preview.name &&
          part.inputPreview.truncated === preview.truncated
        )
          return;
        turn.toolParts.set(toolCallId, { ...part, inputPreview: preview });
        this.emit(turn, { type: 'tool.input.preview', partId: part.id, preview });
      }),
      toolCallCount: 0,
      toolBindingsByProviderName: new Map(),
      toolParts: new Map(),
      tools: request.tools,
      toolStepCount: 0,
      turnId: request.turnId,
    };
    this.activeTurn = turn;
    turn.timeoutHandle = setTimeout(() => this.timeoutTurn(turn), this.limits.turnTimeoutMs);
    void this.run(request, turn);
    return channel.drain();
  }

  async cancel(turnId: string): Promise<void> {
    const turn = this.activeTurn;
    if (!turn || turn.turnId !== turnId) return;
    this.advancePhase(turn, 'cancelling');
    this.abortExecution(turn, new Error('The turn was cancelled.'));
    await settleWithin(turn.agent?.waitForIdle(), PI_TURN_SETTLE_GRACE_MS);
    this.emit(turn, { type: 'cancelled' });
  }

  async respondApproval(input: {
    turnId: string;
    approvalId: string;
    decision: 'approve' | 'deny';
  }): Promise<void> {
    const turn = this.activeTurn;
    if (!turn || turn.turnId !== input.turnId) return;
    const waiter = turn.approvalWaiters.get(input.approvalId);
    if (!waiter) return;
    turn.approvalWaiters.delete(input.approvalId);
    waiter.resolve(input.decision);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const turn = this.activeTurn;
    if (turn) {
      this.advancePhase(turn, 'cancelling');
      this.abortExecution(turn, new Error('The session was closed.'));
      await settleWithin(turn.agent?.waitForIdle(), PI_TURN_SETTLE_GRACE_MS);
      this.emit(turn, { type: 'cancelled' });
    }
  }

  private async run(request: RuntimeExecutionRequest, turn: ActiveTurn): Promise<void> {
    let unsubscribe: (() => void) | undefined;
    const attachmentRedactions = attachmentBodies(request);
    let secrets: readonly string[] = attachmentRedactions;
    try {
      const resolution = await raceAbort(
        this.dependencies.resolveModel(request.model, request.options),
        turn.abortController.signal,
      );
      secrets = [...resolution.redactionValues, ...attachmentRedactions];
      turn.usageContext = resolution.usageContext;
      if (this.settleIfEnding(turn)) return;
      const directTools = request.tools.filter((tool) => tool.ref.source !== 'mcp');
      const mcpTools = request.tools.filter(
        (tool) => tool.ref.source === 'mcp' && tool.approval !== 'deny',
      );
      const deferredToolDiscoveryTools =
        mcpTools.length > 0
          ? createPiDeferredToolDiscoveryTools(
              mcpTools,
              async (target, input, toolCallId, signal) => {
                const output = await this.runRuntimeTool(target, toolCallId, input, signal, turn);
                turn.dispatchCalls.delete(toolCallId);
                this.consumeModelToolResultBudget(turn, toolCallId, target.providerName, output);
                return output;
              },
              (toolCallId, signal, activity, operation) =>
                this.runPiMetaTool(toolCallId, signal, activity, operation, turn),
            )
          : [];
      const piTools = [
        ...directTools.map((tool) => this.toPiTool(tool, turn)),
        ...deferredToolDiscoveryTools,
      ];
      for (const tool of directTools) {
        this.bindPiTool(turn, tool.providerName, { kind: 'runtime', runtimeTool: tool });
      }
      for (const tool of deferredToolDiscoveryTools) {
        this.bindPiTool(
          turn,
          tool.name,
          tool.name === PI_TOOL_CALL_TOOL_NAME
            ? { kind: 'dispatch', displayName: tool.label, providerName: tool.name }
            : { kind: 'meta', displayName: tool.label, providerName: tool.name },
        );
      }
      if (piTools.length > 0 && !resolution.supportsTools) {
        this.emit(turn, {
          type: 'failed',
          error: {
            code: 'unsupported_tools',
            message: 'The selected model does not support native tool calling.',
            retryable: false,
          },
        });
        return;
      }
      const baseConversation = toPiConversation(request, resolution.model);
      const conversation =
        deferredToolDiscoveryTools.length > 0
          ? {
              ...baseConversation,
              systemPrompt: `${baseConversation.systemPrompt}\n\n${PI_DEFERRED_TOOL_DISCOVERY_SYSTEM_PROMPT}`,
            }
          : baseConversation;
      const hasAvailableTools = () => piTools.some((tool) => !turn.unavailableTools.has(tool.name));
      // Compose the turn signal into every provider call: cancellation must
      // reach the HTTP transport directly, not only through pi's own loop
      // signal — which is absent in the pre-agent window and third-party after.
      const providerStream: PiModelResolution['streamFn'] = async (model, context, options) => {
        const stream = await resolution.streamFn(model, context, {
          ...options,
          onPayload:
            turn.toolBudgetError || (turn.unavailableTools.size > 0 && !hasAvailableTools())
              ? async (payload, model) =>
                  disablePiToolCalls(
                    (await options?.onPayload?.(payload, model)) ?? payload,
                    model.api,
                  )
              : options?.onPayload,
          signal: options?.signal
            ? AbortSignal.any([options.signal, turn.abortController.signal])
            : turn.abortController.signal,
        });
        // Match desktop Pi: capture completed calls before the agent can cancel
        // between the provider result and message_end. Pi owns stream failures.
        void stream.result().then(
          (response) => this.recordInvocation(turn, response),
          () => undefined,
        );
        return stream;
      };
      const streamFn = tracePiStream(providerStream, request.trace);
      const models: Pick<Models, 'completeSimple'> = {
        completeSimple: async (model, context, options) => {
          if (
            estimatePiLoopContextHeadroomTokens({
              contextWindow: model.contextWindow,
              maxInputTokens: resolution.maxInputTokens,
              messages: context.messages,
              outputReserveTokens: options?.maxTokens ?? model.maxTokens,
              systemPrompt: context.systemPrompt ?? '',
              tools: context.tools ?? [],
            }) < 0
          ) {
            throw Object.assign(
              new Error('The compaction request exceeds the model input budget.'),
              {
                code: 'context_window_exceeded',
                retryable: false,
              },
            );
          }
          const response = this.contextOptions.completeSimple
            ? await this.contextOptions.completeSimple(model, context, options)
            : await (await streamFn(model, context, options)).result();
          this.recordInvocation(turn, response);
          return response;
        },
      };
      const compactionRedactions = [...secrets, ...sensitiveToolResultValues(conversation.history)];
      const thinkingLevel = resolveThinkingLevel(request, resolution);
      const contextPlan = await raceAbort(
        planPiContext({
          checkpoint: request.contextCheckpoint,
          conversation,
          maxInputTokens: resolution.maxInputTokens,
          model: resolution.model,
          models,
          options: this.contextOptions,
          outputReserveTokens: request.options.maxOutputTokens ?? resolution.model.maxTokens,
          redactSummary: (summary) => redactCompactionSummary(summary, compactionRedactions),
          signal: turn.abortController.signal,
          thinkingLevel,
          tools: piTools,
        }),
        turn.abortController.signal,
      );
      if (this.settleIfEnding(turn)) return;
      if (!contextPlan.ok) {
        this.emit(turn, {
          type: 'failed',
          error: {
            code: contextPlan.code,
            message: contextPlan.message,
            retryable: contextPlan.retryable,
          },
        });
        return;
      }
      if (contextPlan.checkpoint) {
        this.emit(turn, { type: 'context.checkpoint', checkpoint: contextPlan.checkpoint });
      }
      const outputReserveTokens = request.options.maxOutputTokens ?? resolution.model.maxTokens;
      let modelContext: Pick<PiAgentContext, 'systemPrompt' | 'tools'> = {
        systemPrompt: conversation.systemPrompt,
        tools: piTools,
      };
      let responsePhase: 'tools' | 'final-response' | 'done' = 'tools';
      const updateModelContextHeadroom = (messages: PiAgentMessage[]) => {
        turn.modelContextHeadroomTokens = estimatePiLoopContextHeadroomTokens({
          contextWindow: resolution.model.contextWindow,
          maxInputTokens: resolution.maxInputTokens,
          messages,
          outputReserveTokens,
          systemPrompt: modelContext.systemPrompt,
          tools: modelContext.tools ?? [],
        });
      };
      updateModelContextHeadroom([...contextPlan.messages, conversation.prompt]);
      const agentOptions: AgentOptions = {
        afterToolCall: async ({ toolCall }) =>
          turn.failedToolCalls.has(toolCall.id) ? { isError: true } : undefined,
        initialState: {
          messages: contextPlan.messages,
          model: resolution.model,
          systemPrompt: conversation.systemPrompt,
          thinkingLevel,
          tools: piTools,
        },
        prepareNextTurnWithContext: ({ context, toolResults }) => {
          if (responsePhase === 'final-response') {
            responsePhase = 'done';
            if (toolResults.length > 0) turn.limitError = turn.toolBudgetError;
            return undefined;
          }
          if (toolResults.length === 0 || turn.phase !== 'running') return undefined;

          turn.toolStepCount += 1;
          if (turn.toolCallCount >= this.limits.maxToolCalls) {
            turn.toolBudgetError ??= TOOL_CALL_LIMIT_ERROR;
          } else if (turn.toolStepCount >= this.limits.maxToolSteps) {
            turn.toolBudgetError ??= TOOL_STEP_LIMIT_ERROR;
          }
          const nextContext: PiAgentContext = {
            ...context,
            systemPrompt: turn.toolBudgetError
              ? `${context.systemPrompt}\n\n${TOOL_BUDGET_FINAL_RESPONSE_INSTRUCTIONS}`
              : context.systemPrompt,
            // A tool-free answer still needs definitions for its tool history.
            // streamFn disables selection; runtime guards reject further calls.
            tools:
              turn.toolBudgetError || !hasAvailableTools()
                ? piTools
                : context.tools?.filter((tool) => !turn.unavailableTools.has(tool.name)),
          };
          modelContext = nextContext;
          updateModelContextHeadroom(context.messages);
          if (turn.modelContextHeadroomTokens < 0 && !turn.limitError) {
            turn.limitError = TOOL_LOOP_CONTEXT_ERROR;
          }
          if (turn.limitError) return undefined;

          // Pi prepares the next context before asking whether to stop. Allow
          // this one response, then stop even if the model asks for more tools.
          if (turn.toolBudgetError) responsePhase = 'final-response';
          if (turn.toolBudgetError || turn.unavailableTools.size > 0) {
            return { context: nextContext };
          }
          return undefined;
        },
        shouldStopAfterTurn: () => {
          return (
            responsePhase === 'done' || turn.limitError !== undefined || turn.phase !== 'running'
          );
        },
        streamFn,
        toolExecution: 'parallel',
        transformContext: async (messages) => {
          updateModelContextHeadroom(messages);
          return messages;
        },
      };
      const agent = this.createAgent
        ? this.createAgent(agentOptions)
        : await createDefaultAgent(agentOptions);
      turn.agent = agent;
      if (this.settleIfEnding(turn)) {
        agent.abort();
        return;
      }
      unsubscribe = agent.subscribe((event) => this.handlePiEvent(turn, event));

      // Consumer-side cancellation: the abort releases this wait immediately
      // rather than trusting the third-party loop to return. A late settlement
      // is fenced by the terminated phase in `emit()` and `handlePiEvent()`.
      await raceAbort(agent.prompt(conversation.prompt), turn.abortController.signal);
      if (this.settleIfEnding(turn, { emitCancelled: true })) return;

      const terminal = turn.terminalMessage;
      if (!terminal) {
        this.emit(turn, {
          type: 'failed',
          error: {
            code: 'runtime_error',
            message: 'Pi completed without an assistant response.',
            retryable: false,
          },
        });
        return;
      }

      if (turn.limitError) {
        this.emit(turn, { type: 'failed', error: turn.limitError });
        return;
      }
      switch (terminal.stopReason) {
        case 'stop':
        case 'length':
          this.emit(turn, { type: 'completed' });
          break;
        case 'aborted':
          this.emit(turn, { type: 'cancelled' });
          break;
        case 'error':
          this.emit(turn, {
            type: 'failed',
            error: normalizeAiError(terminalExecutionError(terminal), secrets, {
              providerId: resolution.usageContext.providerId,
              modelId: resolution.usageContext.modelId,
            }),
          });
          break;
        case 'toolUse':
        case 'deferred':
        case 'pending':
          this.emit(turn, {
            type: 'failed',
            error: turn.toolBudgetError ?? {
              code: 'runtime_error',
              message: `Pi ended with unsupported stop reason: ${terminal.stopReason}.`,
              retryable: false,
            },
          });
          break;
      }
    } catch (error) {
      if (!this.settleIfEnding(turn, { emitCancelled: true })) {
        this.emit(turn, {
          type: 'failed',
          error: normalizeAiError(error, secrets, {
            providerId: turn.usageContext?.providerId ?? request.model.providerId,
            modelId: turn.usageContext?.modelId ?? request.model.modelId,
          }),
        });
      }
    } finally {
      unsubscribe?.();
    }
  }

  private handlePiEvent(turn: ActiveTurn, event: PiAgentEvent): void {
    if (turn.phase === 'terminated') return;
    switch (event.type) {
      case 'message_start':
        if (event.message.role === 'assistant') {
          turn.currentMessageOrdinal = turn.nextMessageOrdinal++;
        }
        break;
      case 'message_update':
        this.handleAssistantEvent(turn, event.assistantMessageEvent);
        break;
      case 'message_end':
        if (event.message.role === 'assistant') {
          this.recordInvocation(turn, event.message);
          turn.currentMessageOrdinal = undefined;
          // Input was already budgeted before the request; only add this response's content.
          turn.modelContextHeadroomTokens -= estimateTokens(event.message);
        }
        break;
      case 'turn_end':
        if (event.message.role === 'assistant') {
          turn.terminalMessage = event.message;
        }
        this.settleUnmappedToolResults(turn, event.toolResults);
        break;
      default:
        break;
    }
  }

  private handleAssistantEvent(
    turn: ActiveTurn,
    event: Extract<PiAgentEvent, { type: 'message_update' }>['assistantMessageEvent'],
  ): void {
    const ordinal =
      turn.currentMessageOrdinal ?? (turn.currentMessageOrdinal = turn.nextMessageOrdinal++);
    switch (event.type) {
      case 'text_start':
      case 'thinking_start': {
        const type = event.type === 'text_start' ? 'text' : 'reasoning';
        this.emit(turn, {
          type: 'part.add',
          index: turn.nextPartIndex++,
          part: {
            id: `${type}-${ordinal}-${event.contentIndex}`,
            type,
            text: '',
            state: 'streaming',
          },
        });
        break;
      }
      case 'text_delta':
      case 'thinking_delta': {
        const type = event.type === 'text_delta' ? 'text' : 'reasoning';
        this.emit(turn, {
          type: 'text.delta',
          partId: `${type}-${ordinal}-${event.contentIndex}`,
          text: event.delta,
        });
        break;
      }
      case 'text_end':
      case 'thinking_end': {
        const type = event.type === 'text_end' ? 'text' : 'reasoning';
        this.emit(turn, {
          type: 'part.replace',
          part: {
            id: `${type}-${ordinal}-${event.contentIndex}`,
            type,
            text: event.content,
            state: 'done',
          },
        });
        break;
      }
      case 'toolcall_start': {
        const toolCall = event.partial.content[event.contentIndex];
        if (toolCall?.type === 'toolCall') {
          this.ensureStreamingToolPartFromProviderCall(turn, toolCall.id, toolCall.name);
        }
        break;
      }
      case 'toolcall_delta': {
        const call = event.partial.content[event.contentIndex];
        if (call?.type !== 'toolCall') break;
        const binding = turn.toolBindingsByProviderName.get(call.name);
        if (binding?.kind === 'runtime' && binding.runtimeTool.inputPreview) {
          turn.inputPreviews.update(call.id, binding.runtimeTool.inputPreview, call.arguments);
        }
        break;
      }
      case 'toolcall_end':
        turn.inputPreviews.flush(event.toolCall.id);
        this.ensureToolPartFromProviderCall(
          turn,
          event.toolCall.id,
          event.toolCall.name,
          toRuntimeJson(event.toolCall.arguments, {}),
        );
        break;
      default:
        break;
    }
  }

  private toPiTool(runtimeTool: RuntimeTool, turn: ActiveTurn): PiAgentTool {
    return {
      name: runtimeTool.providerName,
      label: runtimeTool.displayName,
      description: runtimeTool.description,
      parameters: runtimeTool.inputSchema as never,
      execute: (toolCallId, params, signal) =>
        this.runTool(runtimeTool, toolCallId, toRuntimeJson(params, {}), signal, turn),
    };
  }

  private async runTool(
    runtimeTool: RuntimeTool,
    toolCallId: string,
    input: RuntimeJsonValue,
    signal: AbortSignal | undefined,
    turn: ActiveTurn,
  ) {
    const output = await this.runRuntimeTool(runtimeTool, toolCallId, input, signal, turn);
    this.consumeModelToolResultBudget(turn, toolCallId, runtimeTool.providerName, output);
    return this.piToolResult(output);
  }

  private async runPiMetaTool(
    toolCallId: string,
    signal: AbortSignal | undefined,
    activity: PiMetaToolActivity,
    operation: (modelOutputCharacterLimit: number) => PiMetaToolExecution,
    turn: ActiveTurn,
  ): Promise<RuntimeToolResult> {
    const part = this.ensureMetaToolPart(turn, activity, toolCallId, activity.input);
    if (activity.providerName === PI_TOOL_CALL_TOOL_NAME) {
      turn.dispatchCalls.delete(toolCallId);
    }

    if (turn.phase !== 'running' || signal?.aborted) {
      return this.interruptToolCall(turn, part);
    }

    turn.toolCallCount += 1;
    if (turn.toolBudgetError || turn.toolCallCount > this.limits.maxToolCalls) {
      turn.toolBudgetError ??= TOOL_CALL_LIMIT_ERROR;
      const output = createErrorToolResult(turn.toolBudgetError);
      this.replaceToolPart(turn, part, {
        state: 'error',
        error: turn.toolBudgetError,
        output,
      });
      turn.failedToolCalls.add(toolCallId);
      turn.settledToolCalls.add(toolCallId);
      this.consumeModelToolResultBudget(turn, toolCallId, activity.providerName, output);
      return output;
    }

    const toolStartedAt = performance.now();
    turn.runtimeTimingSink?.onToolExecutionStart({
      callId: toolCallId,
      toolName: activity.providerName,
    });
    try {
      const modelOutputCharacterLimit = Math.floor(
        Math.max(0, turn.modelContextHeadroomTokens) * PI_ESTIMATED_CHARACTERS_PER_TOKEN,
      );
      if (modelOutputCharacterLimit < MIN_USEFUL_META_TOOL_OUTPUT_CHARACTERS) {
        const output = createErrorToolResult(TOOL_LOOP_CONTEXT_ERROR);
        turn.limitError = TOOL_LOOP_CONTEXT_ERROR;
        this.replaceToolPart(turn, part, {
          state: 'error',
          error: TOOL_LOOP_CONTEXT_ERROR,
          output,
        });
        turn.failedToolCalls.add(toolCallId);
        turn.settledToolCalls.add(toolCallId);
        this.consumeModelToolResultBudget(turn, toolCallId, activity.providerName, output);
        return output;
      }
      const { activityError, activityOutput, modelOutput } = operation(modelOutputCharacterLimit);
      if (turn.phase !== 'running' || signal?.aborted) {
        return this.interruptToolCall(turn, part);
      }
      this.replaceToolPart(
        turn,
        part,
        activityError
          ? { state: 'error', error: activityError, output: activityOutput }
          : { state: 'output-available', output: activityOutput },
      );
      if (activityError) turn.failedToolCalls.add(toolCallId);
      turn.settledToolCalls.add(toolCallId);
      this.consumeModelToolResultBudget(turn, toolCallId, activity.providerName, modelOutput);
      return modelOutput;
    } catch (error) {
      if (turn.phase !== 'running' || signal?.aborted) {
        return this.interruptToolCall(turn, part);
      }
      const executionError = normalizeToolExecutionError(error);
      const output = createErrorToolResult(executionError);
      this.replaceToolPart(turn, part, { state: 'error', error: executionError, output });
      turn.failedToolCalls.add(toolCallId);
      turn.settledToolCalls.add(toolCallId);
      this.consumeModelToolResultBudget(turn, toolCallId, activity.providerName, output);
      return output;
    } finally {
      turn.runtimeTimingSink?.onToolExecutionEnd({
        callId: toolCallId,
        toolName: activity.providerName,
        durationMs: Math.max(0, performance.now() - toolStartedAt),
      });
    }
  }

  private async runRuntimeTool(
    runtimeTool: RuntimeTool,
    toolCallId: string,
    input: RuntimeJsonValue,
    signal: AbortSignal | undefined,
    turn: ActiveTurn,
  ): Promise<RuntimeToolResult> {
    const part = this.ensureToolPart(turn, {
      displayName: runtimeTool.displayName,
      id: `tool-${toolCallId}`,
      input,
      providerName: runtimeTool.providerName,
      toolCallId,
      toolRef: runtimeTool.ref,
    });

    if (turn.phase !== 'running' || signal?.aborted) {
      return this.interruptToolCall(turn, part);
    }

    turn.toolCallCount += 1;
    if (turn.toolBudgetError || turn.toolCallCount > this.limits.maxToolCalls) {
      turn.toolBudgetError ??= TOOL_CALL_LIMIT_ERROR;
      const output = createErrorToolResult(turn.toolBudgetError);
      this.replaceToolPart(turn, part, {
        state: 'error',
        error: turn.toolBudgetError,
        output,
      });
      turn.failedToolCalls.add(toolCallId);
      turn.settledToolCalls.add(toolCallId);
      return output;
    }

    const unavailable = turn.unavailableTools.get(runtimeTool.providerName);
    if (unavailable) {
      this.replaceToolPart(turn, part, {
        state: 'error',
        error: unavailable.failure?.error,
        output: unavailable,
      });
      turn.failedToolCalls.add(toolCallId);
      turn.settledToolCalls.add(toolCallId);
      return unavailable;
    }

    if (runtimeTool.approval === 'deny') {
      this.replaceToolPart(turn, part, { state: 'denied', output: DENIED_TOOL_RESULT });
      turn.settledToolCalls.add(toolCallId);
      return DENIED_TOOL_RESULT;
    }

    if (runtimeTool.approval === 'ask') {
      const approvalId = `approval-${toolCallId}`;
      // A failed registration must never publish an approval card: a duplicate
      // provider call id would orphan the earlier waiter, so the collision
      // settles this call as an error instead (fail closed).
      if (turn.approvalWaiters.has(approvalId)) {
        const output = createErrorToolResult(DUPLICATE_TOOL_CALL_ERROR);
        this.replaceToolPart(turn, part, {
          state: 'error',
          error: DUPLICATE_TOOL_CALL_ERROR,
          output,
        });
        turn.failedToolCalls.add(toolCallId);
        turn.settledToolCalls.add(toolCallId);
        return output;
      }
      // Register before publishing the request: callers may cancel as soon as
      // they observe that event, and cancellation must always find the waiter.
      const decisionPromise = this.waitForApproval(turn, approvalId);
      this.replaceToolPart(turn, part, { state: 'awaiting-approval', approvalId });
      this.emit(turn, {
        type: 'approval.requested',
        approval: {
          id: approvalId,
          turnId: turn.turnId,
          toolCallId,
          toolRef: runtimeTool.ref,
          displayName: runtimeTool.displayName,
          input,
          status: 'pending',
        },
      });
      const decision = await decisionPromise;
      this.emit(turn, {
        type: 'approval.resolved',
        approval: {
          id: approvalId,
          turnId: turn.turnId,
          toolCallId,
          toolRef: runtimeTool.ref,
          displayName: runtimeTool.displayName,
          input,
          status: decision === 'approve' ? 'approved' : 'denied',
        },
      });
      if (decision === 'deny') {
        this.replaceToolPart(turn, part, { state: 'denied', output: DENIED_TOOL_RESULT });
        turn.settledToolCalls.add(toolCallId);
        return DENIED_TOOL_RESULT;
      }
      if (turn.phase !== 'running' || signal?.aborted) {
        return this.interruptToolCall(turn, part);
      }
    }

    this.replaceToolPart(turn, part, { state: 'running' });
    const toolStartedAt = performance.now();
    turn.runtimeTimingSink?.onToolExecutionStart({
      callId: toolCallId,
      toolName: runtimeTool.providerName,
    });
    try {
      const callbackSignal = signal
        ? AbortSignal.any([turn.abortController.signal, signal])
        : turn.abortController.signal;
      const output = await runtimeTool.execute({
        input,
        signal: callbackSignal,
        toolCallId,
      });
      if (turn.phase !== 'running' || callbackSignal.aborted) {
        return this.interruptToolCall(turn, part);
      }
      if (output.failure) {
        this.replaceToolPart(turn, part, { state: 'error', error: output.failure.error, output });
        turn.failedToolCalls.add(toolCallId);
        if (output.failure.scope === 'tool') {
          turn.unavailableTools.set(runtimeTool.providerName, output);
          if (runtimeTool.failureGroup) {
            for (const tool of turn.tools) {
              if (tool.failureGroup === runtimeTool.failureGroup) {
                turn.unavailableTools.set(tool.providerName, output);
              }
            }
          }
        }
      } else {
        this.replaceToolPart(turn, part, { state: 'output-available', output });
      }
      turn.settledToolCalls.add(toolCallId);
      this.emitArtifacts(turn, toolCallId, output);
      return output;
    } catch (error) {
      const isInterrupted =
        turn.phase !== 'running' || turn.abortController.signal.aborted || signal?.aborted;
      if (isInterrupted) {
        return this.interruptToolCall(turn, part);
      }
      const executionError = normalizeToolExecutionError(error);
      const output = createErrorToolResult(executionError);
      this.replaceToolPart(turn, part, {
        state: 'error',
        error: executionError,
        output,
      });
      turn.failedToolCalls.add(toolCallId);
      turn.settledToolCalls.add(toolCallId);
      return output;
    } finally {
      turn.runtimeTimingSink?.onToolExecutionEnd({
        callId: toolCallId,
        toolName: runtimeTool.providerName,
        durationMs: Math.max(0, performance.now() - toolStartedAt),
      });
    }
  }

  private piToolResult(output: RuntimeToolResult) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(output) }],
      details: output,
    };
  }

  private consumeModelToolResultBudget(
    turn: ActiveTurn,
    toolCallId: string,
    toolName: string,
    output: RuntimeToolResult,
  ): void {
    const result: ToolResultMessage<RuntimeToolResult> = {
      role: 'toolResult',
      toolCallId,
      toolName,
      content: [{ type: 'text', text: JSON.stringify(output) }],
      details: output,
      isError: turn.failedToolCalls.has(toolCallId),
      timestamp: Date.now(),
    };
    turn.modelContextHeadroomTokens -= estimatePiMessagesTokens([result]);
  }

  private interruptToolCall(turn: ActiveTurn, part: ToolPartBase) {
    const output = createInterruptedToolResult(INTERRUPTED_TOOL_REASON);
    this.replaceToolPart(turn, part, { state: 'interrupted', output });
    turn.failedToolCalls.add(part.toolCallId);
    turn.settledToolCalls.add(part.toolCallId);
    return output;
  }

  private emitArtifacts(turn: ActiveTurn, toolCallId: string, output: RuntimeToolResult): void {
    output.artifacts.forEach((artifact, index) => {
      this.emit(turn, {
        type: 'part.add',
        index: turn.nextPartIndex++,
        part: {
          id: `artifact-${toolCallId}-${index}`,
          type: 'file',
          ref: artifact.ref,
          mediaType: artifact.mediaType,
          name: artifact.name,
          purpose: 'artifact',
        },
      });
    });
  }

  private ensureToolPartFromProviderCall(
    turn: ActiveTurn,
    toolCallId: string,
    providerName: string,
    input: RuntimeJsonValue,
  ): ToolPartBase | undefined {
    const binding = turn.toolBindingsByProviderName.get(providerName);
    if (!binding) {
      return undefined;
    }
    if (binding.kind === 'dispatch') {
      if (!turn.dispatchCalls.has(toolCallId)) turn.dispatchCalls.set(toolCallId, input);
      return undefined;
    }
    const wasStreaming = turn.streamingToolCalls.delete(toolCallId);
    let part: ToolPartBase;
    if (binding.kind === 'meta') {
      part = this.ensureMetaToolPart(turn, binding, toolCallId, input);
    } else {
      const runtimeTool = binding.runtimeTool;
      part = this.ensureToolPart(turn, {
        displayName: runtimeTool.displayName,
        id: `tool-${toolCallId}`,
        input,
        providerName,
        toolCallId,
        toolRef: runtimeTool.ref,
      });
    }
    if (wasStreaming) this.replaceToolPart(turn, part, { state: 'input-available' });
    return part;
  }

  private ensureStreamingToolPartFromProviderCall(
    turn: ActiveTurn,
    toolCallId: string,
    providerName: string,
  ): void {
    const binding = turn.toolBindingsByProviderName.get(providerName);
    if (!binding || binding.kind === 'dispatch') return;
    if (binding.kind === 'meta') {
      if (!turn.toolParts.has(toolCallId)) turn.streamingToolCalls.add(toolCallId);
      this.ensureMetaToolPart(turn, binding, toolCallId, undefined, 'input-streaming');
      return;
    }
    const runtimeTool = binding.runtimeTool;
    if (!turn.toolParts.has(toolCallId)) turn.streamingToolCalls.add(toolCallId);
    this.ensureToolPart(
      turn,
      {
        displayName: runtimeTool.displayName,
        id: `tool-${toolCallId}`,
        providerName,
        toolCallId,
        toolRef: runtimeTool.ref,
      },
      'input-streaming',
    );
  }

  private bindPiTool(turn: ActiveTurn, providerName: string, binding: PiToolBinding): void {
    if (turn.toolBindingsByProviderName.has(providerName)) {
      throw new Error(`Duplicate Pi tool name: ${providerName}`);
    }
    turn.toolBindingsByProviderName.set(providerName, binding);
  }

  private ensureMetaToolPart(
    turn: ActiveTurn,
    activity: Pick<PiMetaToolActivity, 'displayName' | 'providerName'>,
    toolCallId: string,
    input: RuntimeJsonValue | undefined,
    initialState: ToolPartInitialState = 'input-available',
  ): ToolPartBase {
    return this.ensureToolPart(
      turn,
      {
        displayName: activity.displayName,
        id: `tool-${toolCallId}`,
        ...(input !== undefined ? { input } : {}),
        providerName: activity.providerName,
        toolCallId,
        toolRef: { source: 'meta', name: activity.providerName },
      },
      initialState,
    );
  }

  private ensureToolPart(
    turn: ActiveTurn,
    base: ToolPartBase,
    initialState: ToolPartInitialState = 'input-available',
  ): ToolPartBase {
    const existing = turn.toolParts.get(base.toolCallId);
    if (existing) {
      if (base.input === undefined || base.input === existing.input) return existing;
      const updated = { ...existing, input: base.input };
      turn.toolParts.set(base.toolCallId, updated);
      return updated;
    }
    turn.toolParts.set(base.toolCallId, base);
    this.emit(turn, {
      type: 'part.add',
      index: turn.nextPartIndex++,
      part: { ...base, type: 'tool', state: initialState },
    });
    return base;
  }

  private replaceToolPart(
    turn: ActiveTurn,
    base: ToolPartBase,
    update: Pick<Extract<RuntimeOutputPart, { type: 'tool' }>, 'state'> &
      Partial<Extract<RuntimeOutputPart, { type: 'tool' }>>,
  ): void {
    this.emit(turn, {
      type: 'part.replace',
      part: { ...base, type: 'tool', ...update },
    });
  }

  private settleUnmappedToolResults(turn: ActiveTurn, results: ToolResultMessage[]): void {
    for (const result of results) {
      if (turn.settledToolCalls.has(result.toolCallId)) continue;
      // Pi may surface the rejection used to unwind an approval waiter as a
      // native error result. During cancellation the Runtime terminalizer owns
      // the outcome, so keep the part live and normalize it as interrupted.
      if (turn.phase === 'cancelling') continue;
      const binding = turn.toolBindingsByProviderName.get(result.toolName);
      const base =
        binding?.kind === 'dispatch'
          ? this.ensureMetaToolPart(
              turn,
              binding,
              result.toolCallId,
              createPiDispatchActivityInput(turn.dispatchCalls.get(result.toolCallId)),
            )
          : this.ensureToolPartFromProviderCall(turn, result.toolCallId, result.toolName, null);
      if (!base) continue;
      const output = result.isError
        ? createErrorToolResult(TOOL_EXECUTION_ERROR)
        : { value: toolResultOutput(result), artifacts: [] };
      this.replaceToolPart(
        turn,
        base,
        result.isError
          ? { state: 'error', error: TOOL_EXECUTION_ERROR, output }
          : { state: 'output-available', output },
      );
      if (result.isError) turn.failedToolCalls.add(result.toolCallId);
      turn.settledToolCalls.add(result.toolCallId);
      turn.dispatchCalls.delete(result.toolCallId);
    }
  }

  private interruptUnsettledToolParts(turn: ActiveTurn): void {
    for (const part of turn.toolParts.values()) {
      if (turn.settledToolCalls.has(part.toolCallId)) continue;
      this.replaceToolPart(turn, part, {
        state: 'interrupted',
        output: createInterruptedToolResult(INTERRUPTED_TOOL_REASON),
      });
      turn.failedToolCalls.add(part.toolCallId);
      turn.settledToolCalls.add(part.toolCallId);
    }
  }

  private waitForApproval(turn: ActiveTurn, approvalId: string): Promise<'approve' | 'deny'> {
    return new Promise((resolve, reject) => {
      if (turn.phase !== 'running') {
        reject(new Error('The turn is no longer active.'));
        return;
      }
      turn.approvalWaiters.set(approvalId, { resolve, reject });
    });
  }

  private rejectApprovals(turn: ActiveTurn, reason: Error): void {
    for (const waiter of turn.approvalWaiters.values()) waiter.reject(reason);
    turn.approvalWaiters.clear();
  }

  private abortExecution(turn: ActiveTurn, approvalError: Error): void {
    turn.abortController.abort();
    turn.agent?.abort();
    this.rejectApprovals(turn, approvalError);
  }

  /**
   * Moves the turn out of `running` exactly once; a turn already cancelling,
   * timing out, or terminated keeps its first outcome.
   */
  private advancePhase(turn: ActiveTurn, phase: 'cancelling' | 'timing-out'): boolean {
    if (turn.phase !== 'running') return false;
    turn.phase = phase;
    return true;
  }

  /**
   * The single early-exit check for the run loop: reports whether the turn is
   * past `running` and settles the outcome that is this loop's to publish. A
   * timeout failure is always published here; `cancelled` only where the loop
   * owns it (`emitCancelled`) — otherwise `cancel()`/`close()` publish it
   * after their settle grace, and the terminal fence keeps exactly one.
   */
  private settleIfEnding(turn: ActiveTurn, options?: { emitCancelled?: boolean }): boolean {
    switch (turn.phase) {
      case 'running':
        return false;
      case 'cancelling':
        if (options?.emitCancelled) this.emit(turn, { type: 'cancelled' });
        return true;
      case 'timing-out':
        this.emit(turn, { type: 'failed', error: TURN_TIMEOUT_ERROR });
        return true;
      case 'terminated':
        return true;
    }
  }

  private timeoutTurn(turn: ActiveTurn): void {
    if (!this.advancePhase(turn, 'timing-out')) return;
    this.abortExecution(turn, new Error('The Agent turn timed out.'));
  }

  private recordInvocation(turn: ActiveTurn, message: AssistantMessage): void {
    if (
      !turn.usageContext ||
      turn.phase === 'terminated' ||
      message.stopReason === 'error' ||
      message.stopReason === 'aborted'
    )
      return;
    if (turn.recordedResponses.has(message)) return;
    turn.recordedResponses.add(message);
    const modelId = message.responseModel ?? message.model;
    const requestId = `pi-agent:${turn.turnId}:${message.responseId ?? `call-${turn.nextInvocationOrdinal++}`}:${modelId}`;
    if (turn.recordedInvocations.has(requestId)) return;
    turn.recordedInvocations.add(requestId);
    this.emit(turn, {
      type: 'usage',
      requestId,
      completedAt: Date.now(),
      context: { ...turn.usageContext, modelId },
      usage: toRuntimeUsage(message.usage),
    });
  }

  private emit(turn: ActiveTurn, event: RuntimeEvent): void {
    if (turn.phase === 'terminated') return;
    const isTerminal =
      event.type === 'completed' || event.type === 'failed' || event.type === 'cancelled';
    if (isTerminal) {
      if (turn.timeoutHandle) clearTimeout(turn.timeoutHandle);
      turn.inputPreviews.dispose();
      turn.abortController.abort();
      this.interruptUnsettledToolParts(turn);
      turn.phase = 'terminated';
      this.rejectApprovals(turn, new Error('The turn reached a terminal state.'));
    }
    turn.channel.push(event);
    if (isTerminal) {
      turn.channel.end();
      if (this.activeTurn === turn) this.activeTurn = undefined;
    }
  }
}

export class PiRuntime implements AgentRuntime {
  readonly descriptor = PI_DESCRIPTOR;

  constructor(
    private readonly dependencies: PiRuntimeDependencies,
    private readonly createAgent?: PiRuntimeAgentFactory,
    private readonly limits: PiRuntimeLimits = DEFAULT_PI_RUNTIME_LIMITS,
    private readonly contextOptions: PiRuntimeContextOptions = {},
  ) {}

  async preflightModel(model: RuntimeModel): Promise<RuntimeModelPreflight> {
    return this.dependencies.preflightModel(model);
  }

  async open(): Promise<AgentRuntimeSession> {
    return new PiRuntimeSession(
      this.dependencies,
      this.createAgent,
      this.limits,
      this.contextOptions,
    );
  }
}
