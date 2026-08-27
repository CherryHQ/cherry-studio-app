import type {
  AgentEvent as PiAgentEvent,
  AgentTool as PiAgentTool,
} from '@earendil-works/pi-agent-core';
import type { AgentOptions } from '@earendil-works/pi-agent-core/agent';
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

import { raceAbort, settleWithin } from '../raceAbort';
import { RuntimeEventChannel } from '../RuntimeEventChannel';
import {
  createDeniedToolResult,
  createErrorToolResult,
  createInterruptedToolResult,
  TOOL_EXECUTION_ERROR,
} from '../toolResults';
import type {
  AgentRuntime,
  AgentRuntimeSession,
  RuntimeDescriptor,
  RuntimeError,
  RuntimeEvent,
  RuntimeExecutionRequest,
  RuntimeJsonValue,
  RuntimeModel,
  RuntimeModelPreflight,
  RuntimeOutputPart,
  RuntimeTool,
  RuntimeToolResult,
  RuntimeTextAttachmentPart,
  RuntimeUsage,
  RuntimeUsageContext,
} from '../types';
import { planPiContext, type PiContextCompactionOptions } from './contextCompaction';
import { toPiConversation } from './modelMessages';

export type PiModelResolution = {
  defaultThinkingLevel: ModelThinkingLevel;
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
  maxToolCalls: 16,
  maxToolSteps: 8,
  turnTimeoutMs: 10 * 60 * 1000,
});

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

const DEFAULT_EXECUTION_ERROR_MESSAGE = 'The model provider call failed.';
const MAX_EXECUTION_ERROR_MESSAGE_CHARS = 4_000;
const REDACTED_SECRET = '[REDACTED]';

const TERMINAL_ERROR_DIAGNOSTIC_TYPES = new Set([
  'pi_messages_response_failure',
  'provider_response_failure',
]);
const RETRYABLE_PROVIDER_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETDOWN',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
]);

type ApprovalWaiter = {
  reject(reason: Error): void;
  resolve(decision: 'approve' | 'deny'): void;
};

type ToolPartBase = {
  displayName: string;
  id: string;
  input: RuntimeJsonValue;
  providerName: string;
  toolCallId: string;
  toolRef: RuntimeTool['ref'];
};

type ActiveTurn = {
  abortController: AbortController;
  agent?: PiRuntimeAgent;
  approvalWaiters: Map<string, ApprovalWaiter>;
  channel: RuntimeEventChannel;
  cancelRequested: boolean;
  currentMessageOrdinal?: number;
  failedToolCalls: Set<string>;
  hasUsage: boolean;
  limitError?: RuntimeError;
  nextMessageOrdinal: number;
  nextPartIndex: number;
  settledToolCalls: Set<string>;
  terminalMessage?: AssistantMessage;
  terminated: boolean;
  timedOut: boolean;
  timeoutHandle?: ReturnType<typeof setTimeout>;
  toolCallCount: number;
  toolParts: Map<string, ToolPartBase>;
  toolStepCount: number;
  toolsByProviderName: Map<string, RuntimeTool>;
  turnId: string;
  usage: RuntimeUsage;
  usageContext?: RuntimeUsageContext;
  usageReported: boolean;
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
  const hasNonUserHistoricalTextAttachment = request.history.some((turn) =>
    turn.messages.some(
      (message) =>
        message.role !== 'user' && message.parts.some((part) => part.type === 'text-attachment'),
    ),
  );
  if (
    hasNonUserHistoricalTextAttachment ||
    textAttachments.some((part) => !isValidatedTextAttachment(part))
  ) {
    return {
      code: 'unsupported_input',
      message: 'Pi Runtime accepts only validated untrusted text attachments in user input.',
      retryable: false,
    };
  }
  return null;
}

function isInlineImagePart(part: { mediaType: string; type: 'file'; uri: string }): boolean {
  return (
    part.mediaType.startsWith('image/') &&
    part.uri.startsWith(`data:${part.mediaType};base64,`) &&
    part.uri.length > `data:${part.mediaType};base64,`.length
  );
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

function errorRecord(error: unknown): Record<string, unknown> | undefined {
  return typeof error === 'object' && error !== null
    ? (error as Record<string, unknown>)
    : undefined;
}

function sanitizeErrorText(value: string, secrets: readonly string[], maxChars: number): string {
  const stackStart = value.search(/\n\s+at\s+/);
  let text = (stackStart >= 0 ? value.slice(0, stackStart) : value).trim();

  for (const secret of [...new Set(secrets)].sort((left, right) => right.length - left.length)) {
    if (secret) text = text.replaceAll(secret, REDACTED_SECRET);
  }
  text = text
    .replace(/(bearer\s+)[a-z0-9._~+/=-]+/gi, `$1${REDACTED_SECRET}`)
    .replace(
      /(["']?(?:api[_-]?key|authorization|cookie|password|secret|access[_-]?token|refresh[_-]?token)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi,
      `$1${REDACTED_SECRET}`,
    );

  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

function readErrorStatus(record: Record<string, unknown> | undefined): number | undefined {
  const value = record?.statusCode ?? record?.status;
  const status =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  return Number.isSafeInteger(status) && status >= 100 && status <= 599 ? status : undefined;
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

function isRetryableProviderFailure(
  code: string,
  message: string,
  statusCode: number | undefined,
): boolean {
  const embeddedStatus = message.match(
    /\b(?:status(?: code)?|http|api error)\D{0,12}([1-5]\d{2})\b/iu,
  )?.[1];
  const leadingStatus = message.match(/^\s*([1-5]\d{2})(?=\s|:|$)/u)?.[1];
  const resolvedStatusCode = statusCode ?? Number(embeddedStatus ?? leadingStatus ?? Number.NaN);
  if (
    resolvedStatusCode === 408 ||
    resolvedStatusCode === 409 ||
    resolvedStatusCode === 425 ||
    resolvedStatusCode === 429 ||
    resolvedStatusCode >= 500
  ) {
    return true;
  }
  if (RETRYABLE_PROVIDER_ERROR_CODES.has(code.toUpperCase())) return true;

  return /(?:connection (?:failed|reset)|fetch failed|network request failed|premature close|stream (?:closed|ended unexpectedly)|timed? out)/iu.test(
    message,
  );
}

function normalizeExecutionError(
  error: unknown,
  secrets: readonly string[] = [],
  model?: RuntimeModel,
): RuntimeError {
  const record = errorRecord(error);
  const rawMessage =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : typeof record?.message === 'string'
          ? record.message
          : '';
  const message = sanitizeErrorText(rawMessage, secrets, MAX_EXECUTION_ERROR_MESSAGE_CHARS);
  const code =
    typeof record?.code === 'string'
      ? sanitizeErrorText(record.code, secrets, 128) || 'runtime_error'
      : 'runtime_error';
  const nameValue =
    error instanceof Error
      ? error.name
      : typeof record?.name === 'string'
        ? record.name
        : undefined;
  const name = nameValue ? sanitizeErrorText(nameValue, secrets, 256) : undefined;
  const statusCode = readErrorStatus(record);
  const finishReason =
    typeof record?.finishReason === 'string'
      ? sanitizeErrorText(record.finishReason, secrets, 256)
      : undefined;
  const responseBody =
    typeof record?.responseBody === 'string'
      ? sanitizeErrorText(record.responseBody, secrets, MAX_EXECUTION_ERROR_MESSAGE_CHARS)
      : undefined;
  const explicitRetryable =
    typeof record?.isRetryable === 'boolean'
      ? record.isRetryable
      : typeof record?.retryable === 'boolean'
        ? record.retryable
        : undefined;
  const retryable = explicitRetryable ?? isRetryableProviderFailure(code, message, statusCode);

  return {
    code,
    message: message || DEFAULT_EXECUTION_ERROR_MESSAGE,
    retryable,
    origin: 'provider',
    ...(name ? { name } : {}),
    ...(model || statusCode !== undefined || finishReason || responseBody
      ? {
          context: {
            ...(statusCode !== undefined ? { statusCode } : {}),
            ...(model ? { providerId: model.providerId, modelId: model.modelId } : {}),
            ...(finishReason ? { finishReason } : {}),
            ...(responseBody ? { responseBody } : {}),
          },
        }
      : {}),
  };
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

function textAttachmentBodies(request: RuntimeExecutionRequest): string[] {
  return [
    ...request.input,
    ...request.history.flatMap((turn) => turn.messages.flatMap((message) => message.parts)),
  ].flatMap((part) => (part.type === 'text-attachment' && part.text.length > 0 ? [part.text] : []));
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

function mergeRuntimeUsage(current: RuntimeUsage, next: RuntimeUsage): RuntimeUsage {
  const merged: RuntimeUsage = {
    cacheReadTokens: (current.cacheReadTokens ?? 0) + (next.cacheReadTokens ?? 0),
    cacheWriteTokens: (current.cacheWriteTokens ?? 0) + (next.cacheWriteTokens ?? 0),
    inputTokens: (current.inputTokens ?? 0) + (next.inputTokens ?? 0),
    noCacheTokens: (current.noCacheTokens ?? 0) + (next.noCacheTokens ?? 0),
    outputTokens: (current.outputTokens ?? 0) + (next.outputTokens ?? 0),
    totalTokens: (current.totalTokens ?? 0) + (next.totalTokens ?? 0),
  };
  if (current.reasoningTokens !== undefined || next.reasoningTokens !== undefined) {
    merged.reasoningTokens = (current.reasoningTokens ?? 0) + (next.reasoningTokens ?? 0);
  }
  return merged;
}

function resolveThinkingLevel(
  request: RuntimeExecutionRequest,
  resolution: PiModelResolution,
): ModelThinkingLevel {
  if (!resolution.model.reasoning) return 'off';
  return request.options.reasoningEffort ?? resolution.defaultThinkingLevel;
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
      cancelRequested: false,
      channel,
      failedToolCalls: new Set(),
      hasUsage: false,
      nextMessageOrdinal: 0,
      nextPartIndex: 0,
      settledToolCalls: new Set(),
      terminated: false,
      timedOut: false,
      toolCallCount: 0,
      toolParts: new Map(),
      toolStepCount: 0,
      toolsByProviderName: new Map(request.tools.map((tool) => [tool.providerName, tool])),
      turnId: request.turnId,
      usage: {
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        inputTokens: 0,
        noCacheTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
      usageReported: false,
    };
    this.activeTurn = turn;
    turn.timeoutHandle = setTimeout(() => this.timeoutTurn(turn), this.limits.turnTimeoutMs);
    void this.run(request, turn);
    return channel.drain();
  }

  async cancel(turnId: string): Promise<void> {
    const turn = this.activeTurn;
    if (!turn || turn.turnId !== turnId) return;
    turn.cancelRequested = true;
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
      turn.cancelRequested = true;
      this.abortExecution(turn, new Error('The session was closed.'));
      await settleWithin(turn.agent?.waitForIdle(), PI_TURN_SETTLE_GRACE_MS);
      this.emit(turn, { type: 'cancelled' });
    }
  }

  private async run(request: RuntimeExecutionRequest, turn: ActiveTurn): Promise<void> {
    let unsubscribe: (() => void) | undefined;
    let secrets: readonly string[] = [];
    try {
      const resolution = await raceAbort(
        this.dependencies.resolveModel(request.model, request.options),
        turn.abortController.signal,
      );
      secrets = resolution.redactionValues;
      turn.usageContext = resolution.usageContext;
      if (turn.terminated || turn.cancelRequested) return;
      if (turn.timedOut) {
        this.emit(turn, { type: 'failed', error: TURN_TIMEOUT_ERROR });
        return;
      }
      if (request.tools.length > 0 && !resolution.supportsTools) {
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
      const conversation = toPiConversation(request, resolution.model);
      // Compose the turn signal into every provider call: cancellation must
      // reach the HTTP transport directly, not only through pi's own loop
      // signal — which is absent in the pre-agent window and third-party after.
      const streamFn: PiModelResolution['streamFn'] = (model, context, options) =>
        resolution.streamFn(model, context, {
          ...options,
          signal: options?.signal
            ? AbortSignal.any([options.signal, turn.abortController.signal])
            : turn.abortController.signal,
        });
      const models: Pick<Models, 'completeSimple'> = {
        completeSimple:
          this.contextOptions.completeSimple ??
          (async (model, context, options) => {
            const stream = await streamFn(model, context, options);
            return stream.result();
          }),
      };
      const compactionRedactions = [
        ...secrets,
        ...sensitiveToolResultValues(conversation.history),
        ...textAttachmentBodies(request),
      ];
      const thinkingLevel = resolveThinkingLevel(request, resolution);
      const contextPlan = await raceAbort(
        planPiContext({
          checkpoint: request.contextCheckpoint,
          conversation,
          model: resolution.model,
          models,
          options: this.contextOptions,
          outputReserveTokens: request.options.maxOutputTokens ?? resolution.model.maxTokens,
          redactSummary: (summary) => redactCompactionSummary(summary, compactionRedactions),
          signal: turn.abortController.signal,
          thinkingLevel,
          tools: request.tools,
        }),
        turn.abortController.signal,
      );
      if (turn.terminated) return;
      if (turn.timedOut) {
        this.emit(turn, { type: 'failed', error: TURN_TIMEOUT_ERROR });
        return;
      }
      if (!contextPlan.ok) {
        this.emit(
          turn,
          turn.cancelRequested
            ? { type: 'cancelled' }
            : {
                type: 'failed',
                error: {
                  code: contextPlan.code,
                  message: contextPlan.message,
                  retryable: contextPlan.retryable,
                },
              },
        );
        return;
      }
      if (contextPlan.usage) {
        turn.usage = mergeRuntimeUsage(turn.usage, toRuntimeUsage(contextPlan.usage));
        turn.hasUsage = true;
      }
      if (contextPlan.checkpoint) {
        this.emit(turn, { type: 'context.checkpoint', checkpoint: contextPlan.checkpoint });
      }
      const agentOptions: AgentOptions = {
        afterToolCall: async ({ toolCall }) =>
          turn.failedToolCalls.has(toolCall.id) ? { isError: true } : undefined,
        initialState: {
          messages: contextPlan.messages,
          model: resolution.model,
          systemPrompt: conversation.systemPrompt,
          thinkingLevel,
          tools: this.toPiTools(request.tools, turn),
        },
        shouldStopAfterTurn: ({ toolResults }) => {
          if (toolResults.length > 0) {
            turn.toolStepCount += 1;
            if (turn.toolStepCount >= this.limits.maxToolSteps && !turn.limitError) {
              turn.limitError = TOOL_STEP_LIMIT_ERROR;
            }
          }
          return turn.limitError !== undefined || turn.timedOut || turn.cancelRequested;
        },
        streamFn,
        toolExecution: 'parallel',
      };
      const agent = this.createAgent
        ? this.createAgent(agentOptions)
        : await createDefaultAgent(agentOptions);
      turn.agent = agent;
      if (turn.terminated || turn.cancelRequested) {
        agent.abort();
        return;
      }
      unsubscribe = agent.subscribe((event) => this.handlePiEvent(turn, event));

      // Consumer-side cancellation: the abort releases this wait immediately
      // rather than trusting the third-party loop to return. A late settlement
      // is fenced by `turn.terminated` in `emit()` and `handlePiEvent()`.
      await raceAbort(agent.prompt(conversation.prompt), turn.abortController.signal);
      if (turn.terminated) return;
      if (turn.timedOut) {
        this.emit(turn, { type: 'failed', error: TURN_TIMEOUT_ERROR });
        return;
      }
      if (turn.cancelRequested) {
        this.emit(turn, { type: 'cancelled' });
        return;
      }

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

      this.emit(turn, {
        type: 'usage',
        completedAt: Date.now(),
        context: resolution.usageContext,
        usage: turn.usage,
      });
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
            error: normalizeExecutionError(terminalExecutionError(terminal), secrets, {
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
            error: {
              code: 'runtime_error',
              message: `Pi ended with unsupported stop reason: ${terminal.stopReason}.`,
              retryable: false,
            },
          });
          break;
      }
    } catch (error) {
      if (!turn.terminated) {
        this.emit(
          turn,
          turn.timedOut
            ? { type: 'failed', error: TURN_TIMEOUT_ERROR }
            : turn.cancelRequested
              ? { type: 'cancelled' }
              : {
                  type: 'failed',
                  error: normalizeExecutionError(error, secrets, {
                    providerId: turn.usageContext?.providerId ?? request.model.providerId,
                    modelId: turn.usageContext?.modelId ?? request.model.modelId,
                  }),
                },
        );
      }
    } finally {
      unsubscribe?.();
    }
  }

  private handlePiEvent(turn: ActiveTurn, event: PiAgentEvent): void {
    if (turn.terminated) return;
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
        if (event.message.role === 'assistant') turn.currentMessageOrdinal = undefined;
        break;
      case 'turn_end':
        if (event.message.role === 'assistant') {
          turn.terminalMessage = event.message;
          turn.usage = mergeRuntimeUsage(turn.usage, toRuntimeUsage(event.message.usage));
          turn.hasUsage = true;
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
      case 'toolcall_end':
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

  private toPiTools(tools: RuntimeTool[], turn: ActiveTurn): PiAgentTool[] {
    return tools.map((runtimeTool) => ({
      name: runtimeTool.providerName,
      label: runtimeTool.displayName,
      description: runtimeTool.description,
      parameters: runtimeTool.inputSchema as never,
      execute: (toolCallId, params, signal) =>
        this.runTool(runtimeTool, toolCallId, toRuntimeJson(params, {}), signal, turn),
    }));
  }

  private async runTool(
    runtimeTool: RuntimeTool,
    toolCallId: string,
    input: RuntimeJsonValue,
    signal: AbortSignal | undefined,
    turn: ActiveTurn,
  ) {
    const part = this.ensureToolPart(turn, {
      displayName: runtimeTool.displayName,
      id: `tool-${toolCallId}`,
      input,
      providerName: runtimeTool.providerName,
      toolCallId,
      toolRef: runtimeTool.ref,
    });

    if (turn.cancelRequested || turn.terminated || signal?.aborted) {
      return this.interruptToolCall(turn, part);
    }

    turn.toolCallCount += 1;
    if (turn.toolCallCount > this.limits.maxToolCalls) {
      const output = createErrorToolResult(TOOL_CALL_LIMIT_ERROR);
      turn.limitError = TOOL_CALL_LIMIT_ERROR;
      this.replaceToolPart(turn, part, {
        state: 'error',
        error: TOOL_CALL_LIMIT_ERROR,
        output,
      });
      turn.failedToolCalls.add(toolCallId);
      turn.settledToolCalls.add(toolCallId);
      return this.piToolResult(output);
    }

    if (runtimeTool.approval === 'deny') {
      this.replaceToolPart(turn, part, { state: 'denied', output: DENIED_TOOL_RESULT });
      turn.settledToolCalls.add(toolCallId);
      return this.piToolResult(DENIED_TOOL_RESULT);
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
        return this.piToolResult(output);
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
        return this.piToolResult(DENIED_TOOL_RESULT);
      }
      if (turn.cancelRequested || turn.terminated || signal?.aborted) {
        return this.interruptToolCall(turn, part);
      }
    }

    this.replaceToolPart(turn, part, { state: 'running' });
    try {
      const callbackSignal = signal
        ? AbortSignal.any([turn.abortController.signal, signal])
        : turn.abortController.signal;
      const output = await runtimeTool.execute({
        input,
        signal: callbackSignal,
        toolCallId,
      });
      if (turn.cancelRequested || turn.terminated || turn.timedOut || callbackSignal.aborted) {
        return this.interruptToolCall(turn, part);
      }
      this.replaceToolPart(turn, part, { state: 'output-available', output });
      turn.settledToolCalls.add(toolCallId);
      this.emitArtifacts(turn, toolCallId, output);
      return this.piToolResult(output);
    } catch (error) {
      const isInterrupted =
        turn.cancelRequested ||
        turn.terminated ||
        turn.timedOut ||
        turn.abortController.signal.aborted ||
        signal?.aborted;
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
      return this.piToolResult(output);
    }
  }

  private piToolResult(output: RuntimeToolResult) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(output) }],
      details: output,
    };
  }

  private interruptToolCall(turn: ActiveTurn, part: ToolPartBase) {
    const output = createInterruptedToolResult(INTERRUPTED_TOOL_REASON);
    this.replaceToolPart(turn, part, { state: 'interrupted', output });
    turn.failedToolCalls.add(part.toolCallId);
    turn.settledToolCalls.add(part.toolCallId);
    return this.piToolResult(output);
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
    const runtimeTool = turn.toolsByProviderName.get(providerName);
    if (!runtimeTool) {
      return undefined;
    }
    return this.ensureToolPart(turn, {
      displayName: runtimeTool.displayName,
      id: `tool-${toolCallId}`,
      input,
      providerName,
      toolCallId,
      toolRef: runtimeTool.ref,
    });
  }

  private ensureToolPart(turn: ActiveTurn, base: ToolPartBase): ToolPartBase {
    const existing = turn.toolParts.get(base.toolCallId);
    if (existing) return existing;
    turn.toolParts.set(base.toolCallId, base);
    this.emit(turn, {
      type: 'part.add',
      index: turn.nextPartIndex++,
      part: { ...base, type: 'tool', state: 'input-available' },
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
      if (turn.cancelRequested) continue;
      const base = this.ensureToolPartFromProviderCall(
        turn,
        result.toolCallId,
        result.toolName,
        null,
      );
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
      turn.settledToolCalls.add(result.toolCallId);
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
      if (turn.cancelRequested || turn.terminated) {
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

  private timeoutTurn(turn: ActiveTurn): void {
    if (turn.terminated || turn.timedOut) return;
    turn.timedOut = true;
    this.abortExecution(turn, new Error('The Agent turn timed out.'));
  }

  private emit(turn: ActiveTurn, event: RuntimeEvent): void {
    if (turn.terminated) return;
    if (event.type === 'usage') turn.usageReported = true;
    const isTerminal =
      event.type === 'completed' || event.type === 'failed' || event.type === 'cancelled';
    if (isTerminal) {
      if (turn.timeoutHandle) clearTimeout(turn.timeoutHandle);
      turn.abortController.abort();
      if (turn.hasUsage && !turn.usageReported && turn.usageContext) {
        turn.usageReported = true;
        turn.channel.push({
          type: 'usage',
          completedAt: Date.now(),
          context: turn.usageContext,
          usage: turn.usage,
        });
      }
      this.interruptUnsettledToolParts(turn);
      turn.terminated = true;
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
