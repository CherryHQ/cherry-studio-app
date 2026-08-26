import type {
  AgentEvent as PiAgentEvent,
  AgentTool as PiAgentTool,
} from '@earendil-works/pi-agent-core';
import type { AgentOptions } from '@earendil-works/pi-agent-core/agent';
import type {
  AssistantMessage,
  FetchFunction,
  Message as PiMessage,
  Model as PiModel,
  ModelThinkingLevel,
  ToolResultMessage,
  Usage as PiUsage,
} from '@earendil-works/pi-ai';

import { RuntimeEventChannel } from '../RuntimeEventChannel';
import type {
  AgentRuntime,
  AgentRuntimeSession,
  RuntimeDescriptor,
  RuntimeError,
  RuntimeEvent,
  RuntimeExecutionRequest,
  RuntimeJsonValue,
  RuntimeOutputPart,
  RuntimeTool,
  RuntimeUsage,
  RuntimeUsageContext,
} from '../types';
import { toPiConversation } from './modelMessages';

export type PiModelResolution = {
  apiKey: string;
  defaultThinkingLevel: ModelThinkingLevel;
  fetch?: FetchFunction;
  headers?: Record<string, string>;
  maxRetries: number;
  model: PiModel<'openai-responses'>;
  supportsTools: boolean;
  timeoutMs: number;
  usageContext: RuntimeUsageContext;
};

export interface PiRuntimeDependencies {
  resolveModel(
    model: RuntimeExecutionRequest['model'],
    options: RuntimeExecutionRequest['options'],
  ): PiModelResolution | Promise<PiModelResolution>;
}

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
    attachments: false,
    reasoning: true,
    tools: true,
  },
};

const DENIED_TOOL_OUTPUT: RuntimeJsonValue = {
  reason: 'The user denied this tool call.',
  status: 'denied',
};

const TOOL_EXECUTION_ERROR: RuntimeError = {
  code: 'tool_execution_error',
  message: 'The tool failed to execute.',
  retryable: false,
};

const DEFAULT_EXECUTION_ERROR_MESSAGE = 'The model provider call failed.';
const MAX_EXECUTION_ERROR_MESSAGE_CHARS = 4_000;
const REDACTED_SECRET = '[REDACTED]';

const TERMINAL_TYPES = new Set<RuntimeEvent['type']>(['completed', 'failed', 'cancelled']);

type ApprovalWaiter = {
  reject(reason: Error): void;
  resolve(decision: 'approve' | 'deny'): void;
};

type ToolPartBase = {
  id: string;
  input: RuntimeJsonValue;
  toolCallId: string;
  toolName: string;
};

type ActiveTurn = {
  agent?: PiRuntimeAgent;
  approvalWaiters: Map<string, ApprovalWaiter>;
  channel: RuntimeEventChannel;
  cancelRequested: boolean;
  currentMessageOrdinal?: number;
  nextMessageOrdinal: number;
  nextPartIndex: number;
  settledToolCalls: Set<string>;
  terminalMessage?: AssistantMessage;
  terminated: boolean;
  toolParts: Map<string, ToolPartBase>;
  turnId: string;
  usage: RuntimeUsage;
};

async function createDefaultAgent(options: AgentOptions): Promise<PiRuntimeAgent> {
  const { Agent } = await import('@earendil-works/pi-agent-core/agent');
  return new Agent(options);
}

function validateRequest(request: RuntimeExecutionRequest): RuntimeError | null {
  const hasFileInput = request.input.some((part) => part.type === 'file');
  const hasFileHistory = request.history.some((message) =>
    message.parts.some((part) => part.type === 'file'),
  );
  if (hasFileInput || hasFileHistory) {
    return {
      code: 'unsupported_input',
      message: 'This runtime does not support file attachments.',
      retryable: false,
    };
  }
  return null;
}

function normalizeExecutionError(error: unknown, secrets: readonly string[] = []): RuntimeError {
  const rawMessage =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            typeof error.message === 'string'
          ? error.message
          : '';
  const stackStart = rawMessage.search(/\n\s+at\s+/);
  let message = (stackStart >= 0 ? rawMessage.slice(0, stackStart) : rawMessage).trim();

  for (const secret of [...new Set(secrets)].sort((left, right) => right.length - left.length)) {
    if (secret) message = message.replaceAll(secret, REDACTED_SECRET);
  }

  if (message.length > MAX_EXECUTION_ERROR_MESSAGE_CHARS) {
    message = `${message.slice(0, MAX_EXECUTION_ERROR_MESSAGE_CHARS)}…`;
  }

  return {
    code: 'runtime_error',
    message: message || DEFAULT_EXECUTION_ERROR_MESSAGE,
    retryable: false,
  };
}

function sensitiveValues(resolution: PiModelResolution): string[] {
  const values = [resolution.apiKey];
  for (const [name, value] of Object.entries(resolution.headers ?? {})) {
    if (/authorization|api[-_]key|token|secret/i.test(name)) values.push(value);
  }
  return values;
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
      approvalWaiters: new Map(),
      cancelRequested: false,
      channel,
      nextMessageOrdinal: 0,
      nextPartIndex: 0,
      settledToolCalls: new Set(),
      terminated: false,
      toolParts: new Map(),
      turnId: request.turnId,
      usage: {
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        inputTokens: 0,
        noCacheTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
    };
    this.activeTurn = turn;
    void this.run(request, turn);
    return channel.drain();
  }

  async cancel(turnId: string): Promise<void> {
    const turn = this.activeTurn;
    if (!turn || turn.turnId !== turnId || turn.terminated) return;
    turn.cancelRequested = true;
    turn.agent?.abort();
    this.rejectApprovals(turn, new Error('The turn was cancelled.'));
    await turn.agent?.waitForIdle().catch(() => undefined);
    this.emit(turn, { type: 'cancelled' });
  }

  async respondApproval(input: {
    turnId: string;
    approvalId: string;
    decision: 'approve' | 'deny';
  }): Promise<void> {
    const turn = this.activeTurn;
    if (!turn || turn.turnId !== input.turnId || turn.terminated) return;
    const waiter = turn.approvalWaiters.get(input.approvalId);
    if (!waiter) return;
    turn.approvalWaiters.delete(input.approvalId);
    waiter.resolve(input.decision);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const turn = this.activeTurn;
    if (turn && !turn.terminated) {
      turn.cancelRequested = true;
      turn.agent?.abort();
      this.rejectApprovals(turn, new Error('The session was closed.'));
      await turn.agent?.waitForIdle().catch(() => undefined);
      this.emit(turn, { type: 'cancelled' });
    }
    this.activeTurn = undefined;
  }

  private async run(request: RuntimeExecutionRequest, turn: ActiveTurn): Promise<void> {
    let unsubscribe: (() => void) | undefined;
    let secrets: readonly string[] = [];
    try {
      const resolution = await this.dependencies.resolveModel(request.model, request.options);
      secrets = sensitiveValues(resolution);
      if (turn.terminated) return;
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
      const streamFn: AgentOptions['streamFn'] = async (model, context, options) => {
        const { streamSimple } = await import('@earendil-works/pi-ai/api/openai-responses');
        return streamSimple(model as PiModel<'openai-responses'>, context, {
          ...options,
          apiKey: resolution.apiKey,
          fetch: resolution.fetch,
          headers: resolution.headers,
          maxRetries: resolution.maxRetries,
          maxTokens: request.options.maxOutputTokens ?? resolution.model.maxTokens,
          signal: options?.signal,
          temperature: request.options.temperature,
          timeoutMs: resolution.timeoutMs,
        });
      };
      const agentOptions: AgentOptions = {
        getApiKey: () => resolution.apiKey,
        initialState: {
          messages: conversation.history,
          model: resolution.model,
          systemPrompt: conversation.systemPrompt,
          thinkingLevel: resolveThinkingLevel(request, resolution),
          tools: this.toPiTools(request.tools, turn),
        },
        streamFn,
      };
      const agent = this.createAgent
        ? this.createAgent(agentOptions)
        : await createDefaultAgent(agentOptions);
      turn.agent = agent;
      unsubscribe = agent.subscribe((event) => this.handlePiEvent(turn, event));

      await agent.prompt(conversation.prompt);
      if (turn.terminated) return;
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
            error: normalizeExecutionError(terminal.errorMessage, secrets),
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
          turn.cancelRequested
            ? { type: 'cancelled' }
            : { type: 'failed', error: normalizeExecutionError(error, secrets) },
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
        this.ensureToolPart(turn, {
          id: `tool-${event.toolCall.id}`,
          input: toRuntimeJson(event.toolCall.arguments, {}),
          toolCallId: event.toolCall.id,
          toolName: event.toolCall.name,
        });
        break;
      default:
        break;
    }
  }

  private toPiTools(tools: RuntimeTool[], turn: ActiveTurn): PiAgentTool[] {
    return tools.map((runtimeTool) => ({
      name: runtimeTool.name,
      label: runtimeTool.name,
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
      id: `tool-${toolCallId}`,
      input,
      toolCallId,
      toolName: runtimeTool.name,
    });

    if (runtimeTool.approval === 'deny') {
      this.replaceToolPart(turn, part, { state: 'denied', output: DENIED_TOOL_OUTPUT });
      turn.settledToolCalls.add(toolCallId);
      return this.piToolResult(DENIED_TOOL_OUTPUT);
    }

    if (runtimeTool.approval === 'ask') {
      const approvalId = `approval-${toolCallId}`;
      this.replaceToolPart(turn, part, { state: 'awaiting-approval', approvalId });
      this.emit(turn, {
        type: 'approval.requested',
        approval: {
          id: approvalId,
          turnId: turn.turnId,
          toolCallId,
          toolName: runtimeTool.name,
          input,
          status: 'pending',
        },
      });
      const decision = await this.waitForApproval(turn, approvalId);
      this.emit(turn, {
        type: 'approval.resolved',
        approval: {
          id: approvalId,
          turnId: turn.turnId,
          toolCallId,
          toolName: runtimeTool.name,
          input,
          status: decision === 'approve' ? 'approved' : 'denied',
        },
      });
      if (decision === 'deny') {
        this.replaceToolPart(turn, part, { state: 'denied', output: DENIED_TOOL_OUTPUT });
        turn.settledToolCalls.add(toolCallId);
        return this.piToolResult(DENIED_TOOL_OUTPUT);
      }
    }

    this.replaceToolPart(turn, part, { state: 'running' });
    try {
      const output = await runtimeTool.execute(input, {
        signal: signal ?? new AbortController().signal,
        toolCallId,
      });
      this.replaceToolPart(turn, part, { state: 'output-available', output });
      turn.settledToolCalls.add(toolCallId);
      return this.piToolResult(output);
    } catch {
      this.replaceToolPart(turn, part, {
        state: 'error',
        error: TOOL_EXECUTION_ERROR,
        output: null,
      });
      turn.settledToolCalls.add(toolCallId);
      throw new Error('Tool execution failed.');
    }
  }

  private piToolResult(output: RuntimeJsonValue) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(output) }],
      details: output,
    };
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
      const base = this.ensureToolPart(turn, {
        id: `tool-${result.toolCallId}`,
        input: null,
        toolCallId: result.toolCallId,
        toolName: result.toolName,
      });
      const output = toolResultOutput(result);
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

  private waitForApproval(turn: ActiveTurn, approvalId: string): Promise<'approve' | 'deny'> {
    return new Promise((resolve, reject) => {
      turn.approvalWaiters.set(approvalId, { resolve, reject });
    });
  }

  private rejectApprovals(turn: ActiveTurn, reason: Error): void {
    for (const waiter of turn.approvalWaiters.values()) waiter.reject(reason);
    turn.approvalWaiters.clear();
  }

  private emit(turn: ActiveTurn, event: RuntimeEvent): void {
    if (turn.terminated) return;
    const isTerminal = TERMINAL_TYPES.has(event.type);
    if (isTerminal) {
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
  ) {}

  async open(): Promise<AgentRuntimeSession> {
    return new PiRuntimeSession(this.dependencies, this.createAgent);
  }
}
