/**
 * AiSdkRuntime: the AI SDK implementation of the {@link AgentRuntime} contract
 * from `docs/references/agent/agent-runtime.md`.
 *
 * The runtime maps a prepared {@link RuntimeExecutionRequest} onto a single
 * `streamText` tool loop and translates the AI SDK full stream into normalized
 * {@link RuntimeEvent}s. AI SDK identity stays inside this module: nothing
 * SDK-shaped crosses the contract boundary.
 *
 * Dependency rule: this module may import `ai`/`@ai-sdk/*` (that is its point)
 * but no application protocol, persistence, React, or Expo module. Everything
 * platform- or app-bound — concretely, turning a {@link RuntimeModel} into a
 * configured provider model — arrives through constructor-injected
 * {@link AiSdkRuntimeDependencies}; the runtime never queries Cherry provider
 * or model tables.
 */

import type { ProviderOptions } from '@ai-sdk/provider-utils';
import {
  APICallError,
  InvalidToolInputError,
  jsonSchema,
  NoSuchToolError,
  stepCountIs,
  streamText,
  tool as defineTool,
} from 'ai';
import type { LanguageModel, LanguageModelUsage, ToolSet } from 'ai';

import { RuntimeEventChannel } from '../RuntimeEventChannel';
import type {
  AgentRuntime,
  AgentRuntimeSession,
  RuntimeDescriptor,
  RuntimeError,
  RuntimeEvent,
  RuntimeExecutionRequest,
  RuntimeJsonValue,
  RuntimeModel,
  RuntimeOptions,
  RuntimeTool,
  RuntimeUsage,
} from '../types';
import { toModelMessages } from './modelMessages';

/** A resolved AI SDK model object; the string (gateway) form is not accepted. */
export type ResolvedLanguageModel = Exclude<LanguageModel, string>;

export type AiSdkModelResolution = {
  model: ResolvedLanguageModel;
  /**
   * Provider-specific call options. Composition maps
   * {@link RuntimeOptions.reasoningEffort} here when the provider supports it;
   * the runtime itself stays provider-agnostic.
   */
  providerOptions?: ProviderOptions;
};

/**
 * The application-composition seam. The Host (later phase) builds this from its
 * provider configuration; tests supply a mock language model.
 */
export interface AiSdkRuntimeDependencies {
  resolveModel(
    model: RuntimeModel,
    options: RuntimeOptions,
  ): AiSdkModelResolution | Promise<AiSdkModelResolution>;
}

const AI_SDK_DESCRIPTOR: RuntimeDescriptor = {
  id: 'ai-sdk',
  name: 'AI SDK Runtime',
  capabilities: {
    reasoning: true,
    tools: true,
    approvals: true,
    // File parts carry device URIs the runtime cannot read without Expo
    // FileSystem, which the dependency rule forbids. Attachment support needs a
    // Host-side resolution step and is out of scope for this phase.
    attachments: false,
  },
};

/**
 * Steps, not model round-trips, bound the tool loop. `streamText` defaults to
 * `stepCountIs(1)`, which would stop after the first tool call.
 */
const MAX_TOOL_LOOP_STEPS = 20;

/** JSON result returned to the model when a tool call is denied. */
const DENIED_TOOL_OUTPUT: RuntimeJsonValue = {
  status: 'denied',
  reason: 'The user denied this tool call.',
};

const TERMINAL_TYPES = new Set<RuntimeEvent['type']>(['completed', 'failed', 'cancelled']);

/**
 * Normalize a native failure into a {@link RuntimeError}. Native messages are
 * discarded because provider errors can embed credentials, request bodies, and
 * stack traces; only the error class and its retryability survive.
 */
function normalizeExecutionError(error: unknown): RuntimeError {
  if (APICallError.isInstance(error)) {
    return {
      code: 'provider_call_error',
      message: 'The model provider call failed.',
      retryable: error.isRetryable === true,
    };
  }
  if (NoSuchToolError.isInstance(error)) {
    return {
      code: 'invalid_tool',
      message: 'The model called a tool that is not available.',
      retryable: false,
    };
  }
  if (InvalidToolInputError.isInstance(error)) {
    return {
      code: 'invalid_tool_input',
      message: 'The model supplied invalid input to a tool.',
      retryable: false,
    };
  }
  return {
    code: 'runtime_error',
    message: 'The runtime failed to execute the turn.',
    retryable: false,
  };
}

function toRuntimeUsage(usage: LanguageModelUsage): RuntimeUsage | null {
  const result: RuntimeUsage = {};
  if (isTokenCount(usage.inputTokens)) result.inputTokens = usage.inputTokens;
  if (isTokenCount(usage.outputTokens)) result.outputTokens = usage.outputTokens;
  if (isTokenCount(usage.totalTokens)) result.totalTokens = usage.totalTokens;
  return Object.keys(result).length > 0 ? result : null;
}

function isTokenCount(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function addUsage(cumulative: RuntimeUsage, step: RuntimeUsage): RuntimeUsage {
  const sum = (a: number | undefined, b: number | undefined) =>
    a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);
  const result: RuntimeUsage = {};
  const inputTokens = sum(cumulative.inputTokens, step.inputTokens);
  const outputTokens = sum(cumulative.outputTokens, step.outputTokens);
  const totalTokens = sum(cumulative.totalTokens, step.totalTokens);
  if (inputTokens !== undefined) result.inputTokens = inputTokens;
  if (outputTokens !== undefined) result.outputTokens = outputTokens;
  if (totalTokens !== undefined) result.totalTokens = totalTokens;
  return result;
}

/** Reject file parts up front: this runtime declares `attachments: false`. */
function validateRequest(request: RuntimeExecutionRequest): RuntimeError | null {
  const inputHasFile = request.input.some((part) => part.type === 'file');
  const historyHasFile = request.history.some((message) =>
    message.parts.some((part) => part.type === 'file'),
  );
  if (inputHasFile || historyHasFile) {
    return {
      code: 'unsupported_input',
      message: 'This runtime does not support file attachments.',
      retryable: false,
    };
  }
  return null;
}

type ApprovalWaiter = {
  resolve: (decision: 'approve' | 'deny') => void;
  reject: (reason: Error) => void;
};

type ActiveTurn = {
  turnId: string;
  channel: RuntimeEventChannel;
  abortController: AbortController;
  approvalWaiters: Map<string, ApprovalWaiter>;
  nextPartIndex: number;
  terminated: boolean;
};

class AiSdkRuntimeSession implements AgentRuntimeSession {
  private activeTurn: ActiveTurn | undefined;
  private closed = false;

  constructor(private readonly dependencies: AiSdkRuntimeDependencies) {}

  execute(request: RuntimeExecutionRequest): AsyncIterable<RuntimeEvent> {
    if (this.closed) {
      throw new Error('AiSdkRuntime session is closed.');
    }
    if (this.activeTurn) {
      throw new Error('AiSdkRuntime permits only one active execute per session.');
    }

    const channel = new RuntimeEventChannel();

    const validationError = validateRequest(request);
    if (validationError) {
      // Fail before partial execution: no model resolution, no provider call.
      channel.push({ type: 'failed', error: validationError });
      channel.end();
      return channel.drain();
    }

    const turn: ActiveTurn = {
      turnId: request.turnId,
      channel,
      abortController: new AbortController(),
      approvalWaiters: new Map(),
      nextPartIndex: 0,
      terminated: false,
    };
    this.activeTurn = turn;

    void this.run(request, turn);

    return channel.drain();
  }

  async cancel(turnId: string): Promise<void> {
    const turn = this.activeTurn;
    if (!turn || turn.turnId !== turnId || turn.terminated) {
      return; // idempotent no-op
    }
    turn.abortController.abort();
    this.rejectApprovals(turn, new Error('The turn was cancelled.'));
    this.emit(turn, { type: 'cancelled' });
  }

  async respondApproval(input: {
    turnId: string;
    approvalId: string;
    decision: 'approve' | 'deny';
  }): Promise<void> {
    const turn = this.activeTurn;
    if (!turn || turn.turnId !== input.turnId || turn.terminated) {
      return;
    }
    const waiter = turn.approvalWaiters.get(input.approvalId);
    if (!waiter) {
      return;
    }
    turn.approvalWaiters.delete(input.approvalId);
    waiter.resolve(input.decision);
  }

  async close(): Promise<void> {
    if (this.closed) {
      return; // idempotent
    }
    this.closed = true;
    const turn = this.activeTurn;
    if (turn && !turn.terminated) {
      turn.abortController.abort();
      this.rejectApprovals(turn, new Error('The session was closed.'));
      this.emit(turn, { type: 'cancelled' });
    }
    this.activeTurn = undefined;
  }

  private async run(request: RuntimeExecutionRequest, turn: ActiveTurn): Promise<void> {
    try {
      const resolution = await this.dependencies.resolveModel(request.model, request.options);

      const result = streamText({
        model: resolution.model,
        system: request.instructions.length > 0 ? request.instructions : undefined,
        messages: toModelMessages(request),
        // The contract models system-role history messages; the Host controls
        // their content, so they are not an injection surface here.
        allowSystemInMessages: true,
        tools: this.toToolSet(request.tools, turn),
        stopWhen: stepCountIs(MAX_TOOL_LOOP_STEPS),
        abortSignal: turn.abortController.signal,
        maxOutputTokens: request.options.maxOutputTokens,
        temperature: request.options.temperature,
        providerOptions: resolution.providerOptions,
        // Surface provider failures immediately; retry policy is a Host concern.
        maxRetries: 0,
        // Errors reach the loop below as 'error' stream parts; the default
        // handler would log the native error to the console.
        onError: () => {},
      });

      const streamingParts = new Map<string, { partId: string; text: string }>();
      let cumulativeUsage: RuntimeUsage = {};

      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-start':
          case 'reasoning-start': {
            const kind = part.type === 'text-start' ? 'text' : 'reasoning';
            const partId = `${kind}-${part.id}`;
            streamingParts.set(partId, { partId, text: '' });
            this.emit(turn, {
              type: 'part.add',
              index: turn.nextPartIndex++,
              part: { id: partId, type: kind, text: '', state: 'streaming' },
            });
            break;
          }
          case 'text-delta':
          case 'reasoning-delta': {
            const kind = part.type === 'text-delta' ? 'text' : 'reasoning';
            const partId = `${kind}-${part.id}`;
            const tracked = streamingParts.get(partId);
            if (tracked) {
              tracked.text += part.text;
              this.emit(turn, { type: 'text.delta', partId, text: part.text });
            }
            break;
          }
          case 'text-end':
          case 'reasoning-end': {
            const kind = part.type === 'text-end' ? 'text' : 'reasoning';
            const partId = `${kind}-${part.id}`;
            const tracked = streamingParts.get(partId);
            if (tracked) {
              streamingParts.delete(partId);
              this.emit(turn, {
                type: 'part.replace',
                part: { id: partId, type: kind, text: tracked.text, state: 'done' },
              });
            }
            break;
          }
          case 'finish-step': {
            const stepUsage = toRuntimeUsage(part.usage);
            if (stepUsage) {
              cumulativeUsage = addUsage(cumulativeUsage, stepUsage);
              this.emit(turn, { type: 'usage', usage: cumulativeUsage });
            }
            break;
          }
          case 'finish': {
            const totalUsage = toRuntimeUsage(part.totalUsage);
            if (totalUsage) {
              this.emit(turn, { type: 'usage', usage: totalUsage });
            }
            break;
          }
          case 'error':
            throw part.error;
          case 'abort':
            this.emit(turn, { type: 'cancelled' });
            break;
          default:
            // Tool lifecycle events are emitted from the wrapped tool execute,
            // where approval enforcement lives; the SDK echoes are redundant.
            break;
        }
      }

      this.emit(turn, { type: 'completed' });
    } catch (error) {
      if (turn.abortController.signal.aborted) {
        // cancel()/close() already emitted the terminal event; this is a no-op
        // when the turn has terminated.
        this.emit(turn, { type: 'cancelled' });
        return;
      }
      this.emit(turn, { type: 'failed', error: normalizeExecutionError(error) });
    }
  }

  private toToolSet(tools: RuntimeTool[], turn: ActiveTurn): ToolSet {
    const toolSet: ToolSet = {};
    for (const runtimeTool of tools) {
      toolSet[runtimeTool.name] = defineTool({
        description: runtimeTool.description,
        inputSchema: jsonSchema(
          runtimeTool.inputSchema as unknown as Parameters<typeof jsonSchema>[0],
        ),
        execute: (input, options) =>
          this.runTool(runtimeTool, input as RuntimeJsonValue, options.toolCallId, turn),
      });
    }
    return toolSet;
  }

  private async runTool(
    runtimeTool: RuntimeTool,
    input: RuntimeJsonValue,
    toolCallId: string,
    turn: ActiveTurn,
  ): Promise<RuntimeJsonValue> {
    const partId = `tool-${toolCallId}`;
    const base = {
      id: partId,
      type: 'tool' as const,
      toolCallId,
      toolName: runtimeTool.name,
      input,
    };
    this.emit(turn, {
      type: 'part.add',
      index: turn.nextPartIndex++,
      part: { ...base, state: 'input-available' },
    });

    if (runtimeTool.approval === 'deny') {
      this.emit(turn, { type: 'part.replace', part: { ...base, state: 'denied' } });
      return DENIED_TOOL_OUTPUT;
    }

    let approvalRef: { approvalId: string } | undefined;
    if (runtimeTool.approval === 'ask') {
      const approvalId = `approval-${toolCallId}`;
      approvalRef = { approvalId };
      const approval = {
        id: approvalId,
        turnId: turn.turnId,
        toolCallId,
        toolName: runtimeTool.name,
        input,
      };
      this.emit(turn, {
        type: 'part.replace',
        part: { ...base, state: 'awaiting-approval', approvalId },
      });
      this.emit(turn, {
        type: 'approval.requested',
        approval: { ...approval, status: 'pending' },
      });

      const decision = await this.waitForApproval(turn, approvalId);
      if (decision === 'deny') {
        this.emit(turn, {
          type: 'approval.resolved',
          approval: { ...approval, status: 'denied' },
        });
        this.emit(turn, {
          type: 'part.replace',
          part: { ...base, state: 'denied', approvalId },
        });
        return DENIED_TOOL_OUTPUT;
      }
      this.emit(turn, {
        type: 'approval.resolved',
        approval: { ...approval, status: 'approved' },
      });
    }

    this.emit(turn, {
      type: 'part.replace',
      part: { ...base, state: 'running', ...approvalRef },
    });
    try {
      const output = await runtimeTool.execute(input, {
        signal: turn.abortController.signal,
        toolCallId,
      });
      this.emit(turn, {
        type: 'part.replace',
        part: { ...base, state: 'output-available', output, ...approvalRef },
      });
      return output;
    } catch (error) {
      const normalized = normalizeExecutionError(error);
      this.emit(turn, {
        type: 'part.replace',
        part: { ...base, state: 'error', error: normalized, ...approvalRef },
      });
      // Keep the loop stable: the model receives a normalized error result.
      return { status: 'error', code: normalized.code };
    }
  }

  private waitForApproval(turn: ActiveTurn, approvalId: string): Promise<'approve' | 'deny'> {
    return new Promise<'approve' | 'deny'>((resolve, reject) => {
      if (turn.terminated) {
        reject(new Error('The turn has already ended.'));
        return;
      }
      turn.approvalWaiters.set(approvalId, { resolve, reject });
    });
  }

  private rejectApprovals(turn: ActiveTurn, reason: Error): void {
    for (const waiter of turn.approvalWaiters.values()) {
      waiter.reject(reason);
    }
    turn.approvalWaiters.clear();
  }

  private emit(turn: ActiveTurn, event: RuntimeEvent): void {
    if (turn.terminated) {
      return; // no output may follow a terminal event
    }
    turn.channel.push(event);
    if (TERMINAL_TYPES.has(event.type)) {
      turn.terminated = true;
      turn.channel.end();
      this.rejectApprovals(turn, new Error('The turn ended.'));
      if (this.activeTurn === turn) {
        this.activeTurn = undefined;
      }
    }
  }
}

export class AiSdkRuntime implements AgentRuntime {
  readonly descriptor: RuntimeDescriptor = AI_SDK_DESCRIPTOR;

  constructor(private readonly dependencies: AiSdkRuntimeDependencies) {}

  async open(): Promise<AgentRuntimeSession> {
    return new AiSdkRuntimeSession(this.dependencies);
  }
}
