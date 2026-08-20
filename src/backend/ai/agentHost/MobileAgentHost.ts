/**
 * Mobile Agent Host: the only adapter between the Agent Protocol
 * (`@/shared/contracts/agent`) and the Agent Runtime contract
 * (`@/backend/ai/agent`), per docs/references/agent/.
 *
 * The Host owns Agent lookup, Session persistence, runtime routing, the
 * streaming overlay, snapshots, and lifecycle recovery. It is an app-owned
 * lifecycle service (one per ApplicationHost generation, like ChatRuntime):
 * route unmount only unsubscribes; disposal cancels and awaits active turns.
 *
 * Protocol invariants implemented here (agent-protocol.md):
 * 1.  one active turn per Session (synchronous admission guard);
 * 2.  reservation of user message + assistant placeholder + turn commits in one
 *     transaction before execution;
 * 3/4. the Runtime contract guarantees exactly one terminal event and silence
 *     after it; the run loop stops at the first terminal;
 * 5.  terminal message and turn state commit before terminal events publish;
 * 6.  cancellation settles as `cancelled` (or `interrupted` at startup);
 * 7.  approval responses correlate to the active Session/turn/approval and
 *     fail closed;
 * 8.  `observeSession` captures snapshot and subscription in one synchronous
 *     section, so no event falls into a gap;
 * 9.  operation inputs are schema-parsed, snapshots re-validate, and every
 *     published event is JSON-cloned (a non-JSON-safe value cannot survive);
 * 10. clients supply an execution target and Agent id; runtime ids stay inside
 *     the Host-owned Router.
 */

import type {
  AgentRuntime,
  AgentRuntimeSession,
  RuntimeEvent,
  RuntimeUsage,
} from '@/backend/ai/agent';
import { AiSdkRuntime } from '@/backend/ai/agent';
import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import { mobileAgentSessionService } from '@/backend/data/services/MobileAgentSessionService';
import {
  AgentCancelTurnInputSchema,
  AgentCreateSessionInputSchema,
  AgentDeleteSessionInputSchema,
  AgentRenameSessionInputSchema,
  AgentRespondApprovalInputSchema,
  AgentSubmitMessageInputSchema,
  AgentSessionSnapshotSchema,
  AgentProtocolError,
  type AgentApprovalView,
  type AgentCapabilities,
  type AgentErrorView,
  type AgentEvent,
  type AgentExecutionTarget,
  type AgentInputPart,
  type AgentMessagePart,
  type AgentMessageView,
  type AgentProtocol,
  type AgentSessionObservation,
  type AgentSessionView,
  type AgentTurnView,
} from '@/shared/contracts/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';

import {
  createAssistantAgentDefinitionSource,
  type AgentDefinition,
  type AgentDefinitionSource,
} from './agentDefinitions';
import { createAiSdkModelResolver } from './aiSdkModelResolver';
import {
  toAgentApprovalView,
  toAgentErrorView,
  toAgentMessagePart,
  toAgentUsageView,
  toRuntimeHistory,
  toRuntimeInputParts,
} from './mapping';
import {
  AgentRuntimeRegistry,
  createAgentRuntimeRouter,
  type AgentRuntimeRouter,
} from './runtimeRouting';

const logger = loggerService.withContext('MobileAgentHost');

const INTERRUPTED_ERROR: AgentErrorView = {
  code: 'INTERRUPTED',
  message: 'The app restarted before this turn finished.',
  retryable: true,
};

export interface MobileAgentHostDependencies {
  agents: AgentDefinitionSource;
  persistence: typeof mobileAgentSessionService;
  router: AgentRuntimeRouter;
}

type ActiveTurnState = {
  turn: AgentTurnView;
  assistantMessage: AgentMessageView;
  pendingApprovals: Map<string, AgentApprovalView>;
  usage: RuntimeUsage | null;
  runtimeSession: AgentRuntimeSession;
};

function fail(code: AgentErrorView['code'], message: string, retryable = false): never {
  throw new AgentProtocolError({ code, message, retryable });
}

/** Boundary clone: enforces JSON-safety and detaches listeners from live state. */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

@Injectable('MobileAgentHost')
@ServicePhase(Phase.PostReady)
@DependsOn(['DbService'])
@AppStatePolicy('continue')
export class MobileAgentHost extends BaseService implements AgentProtocol {
  private readonly listeners = new Map<string, Set<(event: AgentEvent) => void>>();
  private readonly activeTurns = new Map<string, ActiveTurnState>();
  private readonly admittingSessions = new Set<string>();
  private readonly runtimeSessions = new Map<
    string,
    { runtimeId: string; session: AgentRuntimeSession }
  >();
  private readonly runningTurns = new Set<Promise<void>>();
  private lazyRouter: AgentRuntimeRouter | undefined;

  /** Every entry is optional so the container can construct this with no arguments. */
  constructor(private readonly overrides: Partial<MobileAgentHostDependencies> = {}) {
    super();
  }

  private get services(): MobileAgentHostDependencies {
    const { overrides } = this;
    return {
      agents: overrides.agents ?? (this.lazyAgents ??= createAssistantAgentDefinitionSource()),
      persistence: overrides.persistence ?? mobileAgentSessionService,
      router: overrides.router ?? this.getDefaultRouter(),
    };
  }

  private lazyAgents: AgentDefinitionSource | undefined;

  private getDefaultRouter(): AgentRuntimeRouter {
    if (!this.lazyRouter) {
      const registry = new AgentRuntimeRegistry().register(
        new AiSdkRuntime(createAiSdkModelResolver()),
      );
      this.lazyRouter = createAgentRuntimeRouter(registry);
    }
    return this.lazyRouter;
  }

  /** Startup reconciliation: unfinished local turns cannot resume. */
  protected override async onInit(): Promise<void> {
    await this.reconcileInterruptedTurns();
  }

  protected override async onDestroy(): Promise<void> {
    for (const { session } of this.runtimeSessions.values()) {
      try {
        await session.close();
      } catch (error) {
        logger.warn('Failed to close a runtime session during disposal', error as Error);
      }
    }
    this.runtimeSessions.clear();
    await Promise.allSettled([...this.runningTurns]);
    this.listeners.clear();
  }

  async reconcileInterruptedTurns(): Promise<number> {
    return this.services.persistence.reconcileInterrupted(INTERRUPTED_ERROR);
  }

  // ── Protocol operations ──

  async createSession(input: {
    agentId: string;
    executionTarget: AgentExecutionTarget;
    title?: string;
  }): Promise<AgentSessionView> {
    const parsed = AgentCreateSessionInputSchema.parse(input);
    const agent = await this.services.agents.getAgent(parsed.agentId);
    if (!agent) {
      fail('AGENT_NOT_FOUND', `Agent does not exist: ${parsed.agentId}`);
    }
    return this.services.persistence.createSession({
      agentId: parsed.agentId,
      title: parsed.title,
    });
  }

  async renameSession(input: { sessionId: string; title: string }): Promise<AgentSessionView> {
    const parsed = AgentRenameSessionInputSchema.parse(input);
    const session = await this.services.persistence.renameSession(parsed.sessionId, parsed.title);
    if (!session) {
      fail('SESSION_NOT_FOUND', `Session does not exist: ${parsed.sessionId}`);
    }
    return session;
  }

  async deleteSession(input: { sessionId: string }): Promise<void> {
    const parsed = AgentDeleteSessionInputSchema.parse(input);
    const active = this.activeTurns.get(parsed.sessionId);
    if (active) {
      await this.cancelTurn({ sessionId: parsed.sessionId, turnId: active.turn.id });
    }
    const cached = this.runtimeSessions.get(parsed.sessionId);
    if (cached) {
      this.runtimeSessions.delete(parsed.sessionId);
      await cached.session.close();
    }
    const deleted = await this.services.persistence.deleteSession(parsed.sessionId);
    if (!deleted) {
      fail('SESSION_NOT_FOUND', `Session does not exist: ${parsed.sessionId}`);
    }
    this.listeners.delete(parsed.sessionId);
  }

  async submitMessage(input: {
    sessionId: string;
    parts: AgentInputPart[];
  }): Promise<{ turnId: string; userMessageId: string; assistantMessageId: string }> {
    const parsed = AgentSubmitMessageInputSchema.parse(input);
    const { sessionId } = parsed;
    this.assertIdle(sessionId);
    // Synchronous admission guard: a second submit that interleaves at any
    // await below still fails SESSION_BUSY (invariant 1).
    this.admittingSessions.add(sessionId);
    try {
      const session = await this.services.persistence.getSession(sessionId);
      if (!session) {
        fail('SESSION_NOT_FOUND', `Session does not exist: ${sessionId}`);
      }
      const agent = await this.requireAgent(session.agentId);
      const runtime = this.routeAgent(agent);
      if (
        !runtime.descriptor.capabilities.attachments &&
        parsed.parts.some((part) => part.type === 'file')
      ) {
        fail('CAPABILITY_UNSUPPORTED', 'File attachments are not supported for this Agent.');
      }

      // History is everything persisted before this turn.
      const priorMessages = await this.services.persistence.listMessages(sessionId);

      const userParts: AgentMessagePart[] = parsed.parts.map((part, index) =>
        part.type === 'text'
          ? { id: `input-${index}`, type: 'text', text: part.text, state: 'done' }
          : {
              id: `input-${index}`,
              type: 'file',
              mediaType: part.mediaType,
              ...(part.name !== undefined ? { name: part.name } : {}),
              uri: part.uri,
            },
      );

      // Invariant 2: reservation commits before execution starts.
      const reserved = await this.services.persistence.reserveTurn({ sessionId, userParts });
      const runtimeSession = await this.getRuntimeSession(sessionId, runtime);

      const state: ActiveTurnState = {
        turn: reserved.turn,
        assistantMessage: reserved.assistantMessage,
        pendingApprovals: new Map(),
        usage: null,
        runtimeSession,
      };
      this.activeTurns.set(sessionId, state);

      this.publish(sessionId, { type: 'message.created', message: reserved.userMessage });
      this.publish(sessionId, { type: 'message.created', message: reserved.assistantMessage });
      this.publish(sessionId, { type: 'turn.updated', turn: reserved.turn });

      const run = this.runTurn(
        sessionId,
        agent,
        state,
        toRuntimeHistory(priorMessages),
        parsed.parts,
      );
      this.runningTurns.add(run);
      void run.finally(() => this.runningTurns.delete(run));

      return {
        turnId: reserved.turn.id,
        userMessageId: reserved.userMessage.id,
        assistantMessageId: reserved.assistantMessage.id,
      };
    } finally {
      this.admittingSessions.delete(sessionId);
    }
  }

  async cancelTurn(input: { sessionId: string; turnId: string }): Promise<void> {
    const parsed = AgentCancelTurnInputSchema.parse(input);
    const active = this.activeTurns.get(parsed.sessionId);
    if (!active || active.turn.id !== parsed.turnId) {
      return; // invariant 6: idempotent, including after the turn settled
    }
    if (active.turn.status !== 'cancelling') {
      const turn = await this.services.persistence.setTurnStatus(parsed.turnId, 'cancelling');
      if (turn && this.activeTurns.get(parsed.sessionId) === active) {
        active.turn = turn;
        this.publish(parsed.sessionId, { type: 'turn.updated', turn });
      }
    }
    await active.runtimeSession.cancel(parsed.turnId);
  }

  async respondApproval(input: {
    sessionId: string;
    turnId: string;
    approvalId: string;
    decision: 'approve' | 'deny';
  }): Promise<void> {
    const parsed = AgentRespondApprovalInputSchema.parse(input);
    const active = this.activeTurns.get(parsed.sessionId);
    const approval = active?.pendingApprovals.get(parsed.approvalId);
    // Invariant 7: correlate to the active Session, turn, and approval; fail closed.
    if (!active || active.turn.id !== parsed.turnId || approval?.status !== 'pending') {
      fail('APPROVAL_NOT_FOUND', 'The approval is not pending on the active turn.');
    }
    await active.runtimeSession.respondApproval({
      turnId: parsed.turnId,
      approvalId: parsed.approvalId,
      decision: parsed.decision,
    });
  }

  async observeSession(
    sessionId: string,
    listener: (event: AgentEvent) => void,
  ): Promise<AgentSessionObservation> {
    const session = await this.services.persistence.getSession(sessionId);
    if (!session) {
      fail('SESSION_NOT_FOUND', `Session does not exist: ${sessionId}`);
    }
    const agent = await this.requireAgent(session.agentId);
    const capabilities = this.projectCapabilities(agent);

    // Snapshot capture and listener registration are one synchronous section:
    // no event can fall into a snapshot/subscription gap (invariant 8).
    const active = this.activeTurns.get(sessionId);
    const snapshot = AgentSessionSnapshotSchema.parse(
      cloneJson({
        agent: { id: agent.id, name: agent.name },
        session,
        capabilities,
        activeTurn: active?.turn ?? null,
        streamingMessage: active?.assistantMessage ?? null,
        pendingApprovals: active
          ? [...active.pendingApprovals.values()].filter((entry) => entry.status === 'pending')
          : [],
      }),
    );
    const sessionListeners = this.listeners.get(sessionId) ?? new Set();
    this.listeners.set(sessionId, sessionListeners);
    sessionListeners.add(listener);

    return {
      snapshot,
      unsubscribe: () => {
        sessionListeners.delete(listener);
      },
    };
  }

  // ── Execution ──

  private async runTurn(
    sessionId: string,
    agent: AgentDefinition,
    state: ActiveTurnState,
    history: ReturnType<typeof toRuntimeHistory>,
    inputParts: AgentInputPart[],
  ): Promise<void> {
    try {
      const events = state.runtimeSession.execute({
        turnId: state.turn.id,
        instructions: agent.instructions,
        model: agent.model,
        history,
        input: toRuntimeInputParts(inputParts),
        // V1 executes tool-less turns; Agent tools await the deferred definition.
        tools: [],
        options: {},
      });
      for await (const event of events) {
        const isTerminal = await this.handleRuntimeEvent(sessionId, state, event);
        if (isTerminal) {
          return;
        }
      }
      // Defensive: a conforming runtime always emits a terminal event.
      await this.finalize(sessionId, state, 'failed', {
        code: 'EXECUTION_FAILED',
        message: 'The runtime ended without a terminal event.',
        retryable: false,
      });
    } catch (error) {
      logger.error('Agent turn failed outside the runtime event stream', error as Error);
      await this.finalize(sessionId, state, 'failed', {
        code: 'EXECUTION_FAILED',
        message: 'The turn failed unexpectedly.',
        retryable: false,
      }).catch(() => undefined);
    }
  }

  /** Returns true when the event was terminal for the turn. */
  private async handleRuntimeEvent(
    sessionId: string,
    state: ActiveTurnState,
    event: RuntimeEvent,
  ): Promise<boolean> {
    switch (event.type) {
      case 'part.add': {
        const part = toAgentMessagePart(event.part);
        state.assistantMessage.parts.push(part);
        if (state.assistantMessage.status === 'pending') {
          state.assistantMessage.status = 'streaming';
        }
        this.publish(sessionId, {
          type: 'message.delta',
          messageId: state.assistantMessage.id,
          delta: { op: 'part.add', index: event.index, part },
        });
        return false;
      }
      case 'text.delta': {
        const part = state.assistantMessage.parts.find((entry) => entry.id === event.partId);
        if (part && (part.type === 'text' || part.type === 'reasoning')) {
          part.text += event.text;
        }
        this.publish(sessionId, {
          type: 'message.delta',
          messageId: state.assistantMessage.id,
          delta: { op: 'text.append', partId: event.partId, text: event.text },
        });
        return false;
      }
      case 'part.replace': {
        const part = toAgentMessagePart(event.part);
        const index = state.assistantMessage.parts.findIndex((entry) => entry.id === part.id);
        if (index >= 0) {
          state.assistantMessage.parts[index] = part;
        }
        this.publish(sessionId, {
          type: 'message.delta',
          messageId: state.assistantMessage.id,
          delta: { op: 'part.replace', part },
        });
        return false;
      }
      case 'approval.requested': {
        const approval = toAgentApprovalView(event.approval, sessionId);
        state.pendingApprovals.set(approval.id, approval);
        await this.services.persistence.upsertApproval(approval);
        const turn = await this.services.persistence.setTurnStatus(
          state.turn.id,
          'awaiting-approval',
        );
        if (turn) {
          state.turn = turn;
          this.publish(sessionId, { type: 'turn.updated', turn });
        }
        this.publish(sessionId, { type: 'approval.requested', approval });
        return false;
      }
      case 'approval.resolved': {
        const approval = toAgentApprovalView(event.approval, sessionId);
        state.pendingApprovals.set(approval.id, approval);
        await this.services.persistence.upsertApproval(approval);
        const hasPending = [...state.pendingApprovals.values()].some(
          (entry) => entry.status === 'pending',
        );
        if (!hasPending && state.turn.status === 'awaiting-approval') {
          const turn = await this.services.persistence.setTurnStatus(state.turn.id, 'running');
          if (turn) {
            state.turn = turn;
            this.publish(sessionId, { type: 'turn.updated', turn });
          }
        }
        this.publish(sessionId, { type: 'approval.resolved', approval });
        return false;
      }
      case 'usage': {
        // Cumulative; the last report before the terminal event is authoritative.
        state.usage = event.usage;
        return false;
      }
      case 'completed':
        await this.finalize(sessionId, state, 'completed', null);
        return true;
      case 'failed':
        await this.finalize(sessionId, state, 'failed', toAgentErrorView(event.error));
        return true;
      case 'cancelled':
        await this.finalize(sessionId, state, 'cancelled', null);
        return true;
      default:
        return false;
    }
  }

  private async finalize(
    sessionId: string,
    state: ActiveTurnState,
    outcome: 'completed' | 'failed' | 'cancelled',
    error: AgentErrorView | null,
  ): Promise<void> {
    const parts: AgentMessagePart[] = state.assistantMessage.parts.map((part) =>
      (part.type === 'text' || part.type === 'reasoning') && part.state === 'streaming'
        ? { ...part, state: 'done' }
        : part,
    );
    if (outcome === 'failed' && error) {
      parts.push({ id: `error-${state.turn.id}`, type: 'error', error });
    }
    const messageStatus =
      outcome === 'completed' ? 'success' : outcome === 'failed' ? 'error' : 'cancelled';

    // Invariant 5: terminal message and turn state commit before the terminal
    // events publish.
    const finalized = await this.services.persistence.finalizeTurn({
      turnId: state.turn.id,
      turnStatus: outcome,
      turnError: error,
      assistantMessageId: state.assistantMessage.id,
      messageStatus,
      parts,
      usage: state.usage ? toAgentUsageView(state.usage) : null,
    });

    if (this.activeTurns.get(sessionId) === state) {
      this.activeTurns.delete(sessionId);
    }
    this.publish(sessionId, { type: 'message.finalized', message: finalized.assistantMessage });
    this.publish(sessionId, { type: 'turn.updated', turn: finalized.turn });
  }

  // ── Helpers ──

  private assertIdle(sessionId: string): void {
    if (this.activeTurns.has(sessionId) || this.admittingSessions.has(sessionId)) {
      fail('SESSION_BUSY', 'The session already has an active turn.');
    }
  }

  private async requireAgent(agentId: string): Promise<AgentDefinition> {
    const agent = await this.services.agents.getAgent(agentId);
    if (!agent) {
      fail('AGENT_NOT_FOUND', `Agent does not exist: ${agentId}`);
    }
    return agent;
  }

  private routeAgent(agent: AgentDefinition): AgentRuntime {
    try {
      return this.services.router.resolve({
        target: { kind: 'local' },
        agentToolIds: agent.agentToolIds,
      });
    } catch (error) {
      logger.warn('Runtime route failed closed', error as Error);
      fail('EXECUTION_UNAVAILABLE', 'No runtime can execute this Agent configuration.');
    }
  }

  private projectCapabilities(agent: AgentDefinition): AgentCapabilities {
    const runtime = this.routeAgent(agent);
    return { ...runtime.descriptor.capabilities };
  }

  /**
   * One Runtime session per active application Session. If a configuration
   * change re-routes to a different Runtime, the old session closes before the
   * new one opens (the route stays fixed for an already-admitted turn).
   */
  private async getRuntimeSession(
    sessionId: string,
    runtime: AgentRuntime,
  ): Promise<AgentRuntimeSession> {
    const cached = this.runtimeSessions.get(sessionId);
    if (cached && cached.runtimeId === runtime.descriptor.id) {
      return cached.session;
    }
    if (cached) {
      await cached.session.close();
    }
    const session = await runtime.open();
    this.runtimeSessions.set(sessionId, { runtimeId: runtime.descriptor.id, session });
    return session;
  }

  private publish(sessionId: string, event: AgentEvent): void {
    const sessionListeners = this.listeners.get(sessionId);
    if (!sessionListeners || sessionListeners.size === 0) {
      return;
    }
    // Boundary clone: enforces JSON-safety (invariant 9) and detaches
    // listeners from the Host's live streaming state.
    const cloned = cloneJson(event);
    for (const listener of sessionListeners) {
      try {
        listener(cloned);
      } catch (error) {
        logger.warn('Agent event listener threw', error as Error);
      }
    }
  }
}
