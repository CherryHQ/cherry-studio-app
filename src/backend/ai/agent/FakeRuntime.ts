/**
 * FakeRuntime: a scriptable, in-memory {@link AgentRuntime} implementation.
 *
 * It is the Host-side test double from `docs/references/agent/agent-runtime.md`
 * ("A fake Runtime exercises Host behavior without either implementation"). A
 * test scripts the emitted {@link RuntimeEvent} sequence per `execute()` call,
 * drives the `ask`-mode approval flow, exercises cancellation, and verifies
 * `close()`. FakeRuntime itself satisfies the contract and passes the shared
 * conformance suite.
 *
 * This module imports only the local Runtime contract. It deliberately pulls in
 * no application protocol, persistence, React, or Expo module (conformance
 * item 11).
 */

import { RuntimeEventChannel } from './RuntimeEventChannel';
import { createInterruptedToolResult } from './toolResults';
import type {
  AgentRuntime,
  AgentRuntimeSession,
  RuntimeCapabilities,
  RuntimeDescriptor,
  RuntimeError,
  RuntimeEvent,
  RuntimeExecutionRequest,
  RuntimeModel,
  RuntimeModelPreflight,
  RuntimeOutputPart,
} from './types';

/**
 * A scripted program models one `execute()` turn. It drives the turn by calling
 * `controller.emit(...)` and awaiting `controller.waitForApproval(...)`, exactly
 * as a real Runtime would translate provider output into normalized events. A
 * program is expected to emit exactly one terminal event; if it returns without
 * one, FakeRuntime emits `completed`, and if it throws, FakeRuntime emits a
 * normalized `failed`.
 */
export type FakeRuntimeProgram = (controller: FakeExecutionController) => void | Promise<void>;

export interface FakeExecutionController {
  readonly request: RuntimeExecutionRequest;
  readonly turnId: string;
  /** Aborts when the turn is cancelled or the session is closed. */
  readonly signal: AbortSignal;
  /** Emit a normalized event. Emissions after a terminal event are ignored. */
  emit(event: RuntimeEvent): void;
  /**
   * Resolve when `respondApproval` is called for `approvalId` on this turn.
   * Rejects if the turn is cancelled or the session closes first.
   */
  waitForApproval(approvalId: string): Promise<'approve' | 'deny'>;
}

const DEFAULT_DESCRIPTOR: RuntimeDescriptor = {
  id: 'fake',
  name: 'Fake Runtime',
  capabilities: {
    reasoning: true,
    tools: true,
    approvals: true,
    attachments: true,
  },
};

/**
 * Normalize an unknown thrown value into a {@link RuntimeError} that carries no
 * credentials or stack trace (conformance item 10). Native messages are
 * discarded because they may embed secrets; only an explicitly thrown
 * RuntimeError-shaped value passes through.
 */
function normalizeError(error: unknown): RuntimeError {
  if (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as RuntimeError).code === 'string' &&
    typeof (error as RuntimeError).message === 'string' &&
    typeof (error as RuntimeError).retryable === 'boolean'
  ) {
    const runtimeError = error as RuntimeError;
    return {
      code: runtimeError.code,
      message: runtimeError.message,
      retryable: runtimeError.retryable,
      ...(runtimeError.origin === 'provider' ||
      runtimeError.origin === 'runtime' ||
      runtimeError.origin === 'host' ||
      runtimeError.origin === 'tool'
        ? { origin: runtimeError.origin }
        : {}),
      ...(typeof runtimeError.name === 'string' ? { name: runtimeError.name } : {}),
      ...(runtimeError.context && typeof runtimeError.context === 'object'
        ? {
            context: {
              ...(typeof runtimeError.context.statusCode === 'number'
                ? { statusCode: runtimeError.context.statusCode }
                : {}),
              ...(typeof runtimeError.context.providerId === 'string'
                ? { providerId: runtimeError.context.providerId }
                : {}),
              ...(typeof runtimeError.context.modelId === 'string'
                ? { modelId: runtimeError.context.modelId }
                : {}),
              ...(typeof runtimeError.context.finishReason === 'string'
                ? { finishReason: runtimeError.context.finishReason }
                : {}),
              ...(typeof runtimeError.context.responseBody === 'string'
                ? { responseBody: runtimeError.context.responseBody }
                : {}),
            },
          }
        : {}),
    };
  }
  return {
    code: 'runtime_error',
    message: 'The runtime failed to execute the turn.',
    retryable: false,
  };
}

/**
 * Validate a request against capabilities so unsupported input or tools fail
 * before any partial execution (conformance item 5). Returns a normalized error
 * to emit as the sole terminal event, or `null` when the request is supported.
 */
function validateRequest(
  request: RuntimeExecutionRequest,
  capabilities: RuntimeCapabilities,
): RuntimeError | null {
  if (!capabilities.tools && request.tools.length > 0) {
    return {
      code: 'unsupported_tool',
      message: 'This runtime does not support tools.',
      retryable: false,
    };
  }
  if (!capabilities.approvals && request.tools.some((tool) => tool.approval === 'ask')) {
    return {
      code: 'unsupported_approval',
      message: 'This runtime does not support tool approvals.',
      retryable: false,
    };
  }
  if (!capabilities.attachments) {
    if (
      request.input.some((part) => part.type === 'file' || part.type === 'text-attachment') ||
      request.history.some((turn) =>
        turn.messages.some((message) =>
          message.parts.some((part) => part.type === 'file' || part.type === 'text-attachment'),
        ),
      )
    ) {
      return {
        code: 'unsupported_input',
        message: 'This runtime does not support file attachments.',
        retryable: false,
      };
    }
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
  toolParts: Map<string, Extract<RuntimeOutputPart, { type: 'tool' }>>;
};

class FakeRuntimeSession implements AgentRuntimeSession {
  private activeTurn: ActiveTurn | undefined;
  private closed = false;

  constructor(
    private readonly capabilities: RuntimeCapabilities,
    private readonly programs: FakeRuntimeProgram[],
  ) {}

  execute(request: RuntimeExecutionRequest): AsyncIterable<RuntimeEvent> {
    if (this.closed) {
      throw new Error('FakeRuntime session is closed.');
    }
    if (this.activeTurn) {
      throw new Error('FakeRuntime permits only one active execute per session.');
    }

    const channel = new RuntimeEventChannel();

    const validationError = validateRequest(request, this.capabilities);
    if (validationError) {
      // Fail before any partial execution: the only event is the terminal.
      channel.push({ type: 'failed', error: validationError });
      channel.end();
      return channel.drain();
    }

    const turn: ActiveTurn = {
      turnId: request.turnId,
      channel,
      abortController: new AbortController(),
      approvalWaiters: new Map(),
      toolParts: new Map(),
    };
    this.activeTurn = turn;

    const controller: FakeExecutionController = {
      request,
      turnId: request.turnId,
      signal: turn.abortController.signal,
      emit: (event) => this.emitFor(turn, event),
      waitForApproval: (approvalId) => this.waitForApproval(turn, approvalId),
    };

    const program = this.programs.shift() ?? defaultProgram;

    void Promise.resolve()
      .then(() => program(controller))
      .then(() => {
        // A program that returns without a terminal event completes the turn.
        this.emitFor(turn, { type: 'completed' });
      })
      .catch((error: unknown) => {
        this.emitFor(turn, { type: 'failed', error: normalizeError(error) });
      });

    return turn.channel.drain();
  }

  async cancel(turnId: string): Promise<void> {
    const turn = this.activeTurn;
    if (!turn || turn.turnId !== turnId) {
      return; // idempotent no-op
    }
    turn.abortController.abort();
    this.rejectApprovals(turn, new Error('The turn was cancelled.'));
    this.emitFor(turn, { type: 'cancelled' });
  }

  async respondApproval(input: {
    turnId: string;
    approvalId: string;
    decision: 'approve' | 'deny';
  }): Promise<void> {
    const turn = this.activeTurn;
    if (!turn || turn.turnId !== input.turnId) {
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
    if (turn) {
      turn.abortController.abort();
      this.rejectApprovals(turn, new Error('The session was closed.'));
      this.emitFor(turn, { type: 'cancelled' });
    }
    // Release scripted resources.
    this.programs.length = 0;
  }

  private emitFor(turn: ActiveTurn, event: RuntimeEvent): void {
    if (this.activeTurn !== turn) {
      return; // no output may follow a terminal event
    }
    const isTerminal =
      event.type === 'completed' || event.type === 'failed' || event.type === 'cancelled';
    if (isTerminal) {
      this.interruptUnsettledToolParts(turn);
    } else if (
      (event.type === 'part.add' || event.type === 'part.replace') &&
      event.part.type === 'tool'
    ) {
      turn.toolParts.set(event.part.toolCallId, event.part);
    }
    turn.channel.push(event);
    if (isTerminal) {
      turn.channel.end();
      this.rejectApprovals(turn, new Error('The turn ended.'));
      this.activeTurn = undefined;
    }
  }

  private interruptUnsettledToolParts(turn: ActiveTurn): void {
    for (const part of turn.toolParts.values()) {
      if (
        part.state === 'output-available' ||
        part.state === 'denied' ||
        part.state === 'error' ||
        part.state === 'interrupted'
      ) {
        continue;
      }
      const { approvalId: _approvalId, error: _error, output: _output, ...base } = part;
      const interrupted: Extract<RuntimeOutputPart, { type: 'tool' }> = {
        ...base,
        state: 'interrupted',
        output: createInterruptedToolResult('The turn ended before this tool call completed.'),
      };
      turn.toolParts.set(part.toolCallId, interrupted);
      turn.channel.push({ type: 'part.replace', part: interrupted });
    }
  }

  private waitForApproval(turn: ActiveTurn, approvalId: string): Promise<'approve' | 'deny'> {
    return new Promise<'approve' | 'deny'>((resolve, reject) => {
      if (this.activeTurn !== turn) {
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
}

const defaultProgram: FakeRuntimeProgram = (controller) => {
  controller.emit({ type: 'completed' });
};

export type FakeRuntimeOptions = {
  descriptor?: RuntimeDescriptor;
  modelPreflight?: RuntimeModelPreflight;
};

export class FakeRuntime implements AgentRuntime {
  readonly descriptor: RuntimeDescriptor;
  private readonly programs: FakeRuntimeProgram[] = [];
  private readonly modelPreflight: RuntimeModelPreflight;

  constructor(options: FakeRuntimeOptions = {}) {
    this.descriptor = options.descriptor ?? DEFAULT_DESCRIPTOR;
    this.modelPreflight =
      options.modelPreflight ??
      createDefaultModelPreflight(
        this.descriptor.capabilities.attachments,
        this.descriptor.capabilities.tools,
      );
  }

  async preflightModel(_model: RuntimeModel): Promise<RuntimeModelPreflight> {
    return {
      ...this.modelPreflight,
      inputModalities: [...this.modelPreflight.inputModalities],
    };
  }

  /** Enqueue a program consumed by the next `execute()` call, FIFO. */
  script(program: FakeRuntimeProgram): this {
    this.programs.push(program);
    return this;
  }

  /**
   * Enqueue a program that emits a fixed event list in order. The caller is
   * responsible for including a terminal event; otherwise FakeRuntime appends
   * `completed`.
   */
  scriptEvents(events: readonly RuntimeEvent[]): this {
    return this.script((controller) => {
      for (const event of events) {
        controller.emit(event);
      }
    });
  }

  async open(): Promise<AgentRuntimeSession> {
    // Sessions share the runtime's script queue: enqueue programs before or
    // between executes, and each execute dequeues the next one.
    return new FakeRuntimeSession(this.descriptor.capabilities, this.programs);
  }
}

function createDefaultModelPreflight(
  supportsImages: boolean,
  supportsTools: boolean,
): RuntimeModelPreflight {
  return {
    contextWindow: 128_000,
    inputModalities: supportsImages ? ['text', 'image'] : ['text'],
    maxInputTokens: 120_000,
    maxOutputTokens: 8_000,
    supportsTools,
  };
}
