/**
 * Mobile Agent Host: the only adapter between the Agent Protocol
 * (`@/shared/contracts/agent`) and the Agent Runtime contract
 * (`../runtime`), per docs/references/agent/.
 *
 * The Host owns Agent lookup, Session persistence, the local Runtime binding, the
 * streaming overlay, snapshots, and lifecycle recovery. It is an app-owned
 * lifecycle service (one per ApplicationHost generation):
 * route unmount only unsubscribes; disposal cancels and awaits active turns.
 *
 * The write-free stretch between admission and the first durable row lives in
 * `./turnPreparation` (gates and the frozen `TurnPlan`); attachment admission
 * and materialization live in `./turnAttachments`. The two adaptation
 * directions are separate modules: `./turnRuntimeInput` assembles the Runtime
 * request, `./runtimeProjection` projects Runtime output back onto the
 * protocol. This class keeps admission, reservation, execution, and terminal
 * settlement.
 *
 * Protocol invariants implemented here (agent-protocol.md):
 * 1.  one active turn per Session (synchronous admission guard);
 * 2.  reservation of user message + assistant placeholder commits atomically
 *     before execution;
 * 3/4. the Runtime contract guarantees exactly one terminal event and silence
 *     after it; the run loop stops at the first terminal;
 * 5.  terminal message state commits before terminal events publish; the
 *     terminal turn is a projection of that committed message;
 * 6.  cancellation settles as `cancelled` (or `interrupted` at startup);
 * 7.  approval responses correlate to the active Session/turn/approval and
 *     fail closed;
 * 8.  `observeSession` captures snapshot and subscription in one synchronous
 *     section, so no event falls into a gap;
 * 9.  operation inputs are schema-parsed, snapshots re-validate, and every
 *     published event is JSON-cloned (a non-JSON-safe value cannot survive);
 * 10. clients supply an execution target and Agent id; the local Pi binding
 *     stays private to the Host.
 * 14. a Draft Session becomes durable in the same transaction as its first
 *     user/assistant message reservation.
 */

import type { AiService } from '@/backend/ai/AiService';
import type { McpRuntimeService } from '@/backend/ai/mcp';
import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import { agentToolBindingService } from '@/backend/data/services/AgentToolBindingService';
import { modelService } from '@/backend/data/services/ModelService';
import { providerService } from '@/backend/data/services/ProviderService';
import type {
  BackgroundReplyLifecycle,
  BackgroundReplyTurn,
} from '@/backend/services/backgroundReply';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';
import {
  AgentCancelTurnInputSchema,
  AgentDeleteSessionInputSchema,
  AgentForkSessionInputSchema,
  AgentRenameSessionInputSchema,
  AgentRespondApprovalInputSchema,
  AgentStartSessionInputSchema,
  AgentSubmitMessageInputSchema,
  AgentSessionSnapshotSchema,
  AgentProtocolError,
  type AgentApprovalView,
  type AgentCapabilities,
  type AgentErrorView,
  type AgentEvent,
  type AgentExecutionTarget,
  type AgentForkSessionInput,
  type AgentInputPart,
  type AgentMessagePart,
  type AgentMessageView,
  type AgentProtocol,
  type AgentSessionObservation,
  type AgentSessionView,
  type AgentStartSessionInput,
  type AgentSubmitMessageInput,
  type AgentTurnView,
} from '@/shared/contracts/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';

import {
  managedFileResolver,
  type ManagedFileResolver,
  type TurnResourceLedger,
} from '../resources/managedFileResolver';
import type {
  AgentRuntime,
  AgentRuntimeSession,
  RuntimeContextCheckpoint,
  RuntimeEvent,
  RuntimeUsageReport,
} from '../runtime';
import { raceAbort } from '../runtime';
import type { AgentSessionStore, ReserveSubmissionResult } from '../sessionStore/AgentSessionStore';
import { interruptNonTerminalToolParts } from '../sessionStore/messageSettlement';
import {
  createSystemCapabilitySource,
  type SystemCapabilitySource,
} from '../tools/builtInToolSource';
import {
  createAgentRuntimeToolResolver,
  type AgentRuntimeToolResolver,
} from '../tools/runtimeTools';
import {
  createAgentTableDefinitionSource,
  type AgentDefinition,
  type AgentDefinitionSource,
} from './agentDefinitions';
import { AgentSessionNaming } from './AgentSessionNaming';
import { AgentSessionUsageRecorder } from './AgentSessionUsageRecorder';
import { validateRuntimeContextCheckpoint } from './contextCheckpoints';
import { type AgentInferenceModelResolver, resolveAgentInferenceModel } from './inferenceSnapshot';
import {
  toAgentApprovalView,
  toAgentErrorView,
  toAgentMessagePart,
  toAgentUsageView,
} from './runtimeProjection';
import { materializeRuntimeAttachments } from './turnAttachments';
import {
  prepareInitialTurn,
  prepareTurn,
  type TurnPlan,
  type TurnPreparationDependencies,
} from './turnPreparation';
import { toRuntimeHistory, toRuntimeInputParts } from './turnRuntimeInput';

const logger = loggerService.withContext('MobileAgentHost');

const INTERRUPTED_ERROR: AgentErrorView = {
  code: 'INTERRUPTED',
  message: 'The app restarted before this turn finished.',
  retryable: true,
};

const NOOP_BACKGROUND_REPLY_TURN: BackgroundReplyTurn = {
  awaitApproval: () => {},
  finish: () => {},
  update: () => {},
};

/**
 * Runtime events after which the background-reply surface must re-read the
 * assistant message. Declaring the set here rather than notifying inside each
 * branch means a newly handled event cannot silently stop refreshing the live
 * notification — a drift no test would catch.
 */
const MESSAGE_SURFACE_EVENTS: ReadonlySet<RuntimeEvent['type']> = new Set([
  'approval.resolved',
  'part.add',
  'part.replace',
  'text.delta',
]);

const TERMINAL_PERSISTENCE_RETRY_DELAYS_MS = [0, 50, 200] as const;

type MobileAgentHostOverrides = {
  agents: AgentDefinitionSource;
  files: ManagedFileResolver;
  inferenceModel: AgentInferenceModelResolver;
  naming: Pick<
    AgentSessionNaming,
    'drain' | 'maybeRenameFromConversationSummary' | 'maybeRenameFromFirstUserMessage'
  >;
  runtimeTools: AgentRuntimeToolResolver;
  usage: Pick<AgentSessionUsageRecorder, 'drain' | 'record'>;
  tools: SystemCapabilitySource;
};

/**
 * The Host owns the Turn projection (agent-persistence.md): the store persists
 * messages only, live turn state exists here, and the terminal turn view is
 * derived from the settled assistant message.
 */
type ActiveTurnState = {
  agent: AgentDefinition;
  abortController: AbortController;
  turn: AgentTurnView;
  activeUserMessage: AgentMessageView;
  assistantMessage: AgentMessageView;
  autoNamePromise: Promise<AgentSessionView | null> | null;
  autoNameUserParts: AgentInputPart[] | null;
  backgroundReply: BackgroundReplyTurn;
  hasHistoryBeforeActiveTurn: boolean;
  pendingApprovals: Map<string, AgentApprovalView>;
  pendingContextCheckpoint: RuntimeContextCheckpoint | null;
  resources: TurnResourceLedger;
  sessionTurnIds: Set<string>;
  usage: RuntimeUsageReport | null;
  runtimeSession: AgentRuntimeSession;
};

type AdmissionState = {
  abortController: AbortController;
  completion: Promise<void>;
};

class TerminalPersistenceError extends Error {
  override readonly name = 'TerminalPersistenceError';

  constructor(readonly failure: unknown) {
    super('The Agent Host could not persist a terminal turn state.');
  }
}

function fail(code: AgentErrorView['code'], message: string, retryable = false): never {
  throw new AgentProtocolError({ code, message, retryable });
}

/** Boundary clone: enforces JSON-safety and detaches listeners from live state. */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createCompletionSignal(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

@Injectable('MobileAgentHost')
@ServicePhase(Phase.PostReady)
// Tool Runtime owners stop after this Host has drained its frozen turn
// catalogs. Constructor injection keeps runtime ownership and lifecycle
// ordering on the same declared edges. Covered by a stop-order test.
@DependsOn([
  'AgentSessionStore',
  'AiService',
  'PreferenceService',
  'BackgroundReplyRuntime',
  'McpRuntimeService',
  'WebSearchService',
  'AgentRuntime',
])
@AppStatePolicy('continue')
export class MobileAgentHost extends BaseService implements AgentProtocol {
  private readonly listeners = new Map<string, Set<(event: AgentEvent) => void>>();
  private readonly activeTurns = new Map<string, ActiveTurnState>();
  private readonly admittingSessions = new Map<string, AdmissionState>();
  private readonly initialAdmissions = new Set<AdmissionState>();
  private readonly observingSessions = new Map<string, Set<Promise<void>>>();
  private readonly deletingSessions = new Set<string>();
  private readonly runningTurnsBySession = new Map<string, Promise<void>>();
  private readonly runtimeSessions = new Map<
    string,
    { runtimeId: string; session: AgentRuntimeSession }
  >();
  private readonly runningTurns = new Set<Promise<void>>();
  private readonly files: ManagedFileResolver;
  private readonly naming: MobileAgentHostOverrides['naming'];
  private readonly usage: MobileAgentHostOverrides['usage'];
  private readonly inferenceModel: MobileAgentHostOverrides['inferenceModel'];
  private readonly runtimeTools: MobileAgentHostOverrides['runtimeTools'];
  private readonly lifecycleAbortController = new AbortController();
  private acceptingSubmissions = true;

  /**
   * Lifecycle composition supplies the selected store adapter and the Runtime
   * bound at the composition root (`AgentRuntime` registration); tests may
   * replace the Runtime and Agent ports.
   */
  constructor(
    private readonly store: AgentSessionStore,
    private readonly aiService: AiService,
    private readonly preferenceService: PreferenceService,
    private readonly backgroundReply: BackgroundReplyLifecycle,
    mcpRuntime: McpRuntimeService,
    private readonly webSearchService: WebSearchService,
    private readonly runtime: AgentRuntime,
    private readonly overrides: Partial<MobileAgentHostOverrides> = {},
  ) {
    super();
    this.files = overrides.files ?? managedFileResolver;
    this.naming =
      overrides.naming ??
      new AgentSessionNaming({
        ai: aiService,
        model: modelService,
        preference: preferenceService,
        provider: providerService,
        signal: this.lifecycleAbortController.signal,
        store,
      });
    this.usage = overrides.usage ?? new AgentSessionUsageRecorder();
    this.inferenceModel = overrides.inferenceModel ?? resolveAgentInferenceModel;
    this.runtimeTools =
      overrides.runtimeTools ??
      createAgentRuntimeToolResolver({
        bindings: agentToolBindingService,
        getMcpRuntime: () => mcpRuntime,
      });
  }

  private get agents(): AgentDefinitionSource {
    return this.overrides.agents ?? (this.lazyAgents ??= createAgentTableDefinitionSource());
  }

  private lazyAgents: AgentDefinitionSource | undefined;

  private get systemCapabilities(): SystemCapabilitySource {
    return (
      this.overrides.tools ??
      (this.lazySystemCapabilities ??= createSystemCapabilitySource({
        ai: this.aiService,
        preference: this.preferenceService,
        webSearch: this.webSearchService,
      }))
    );
  }

  private lazySystemCapabilities: SystemCapabilitySource | undefined;

  /** Ports for the write-free preparation stage; accessors keep test overrides live. */
  private get turnPreparation(): TurnPreparationDependencies {
    return {
      agents: this.agents,
      files: this.files,
      inferenceModel: this.inferenceModel,
      routeExecutionTarget: (target) => this.routeExecutionTarget(target),
      runtimeTools: this.runtimeTools,
      store: this.store,
      systemCapabilities: this.systemCapabilities,
    };
  }

  /** Reconcile any unfinished state available from the selected store. */
  protected override async onInit(): Promise<void> {
    await this.reconcileInterruptedTurns();
  }

  /**
   * Stop owns the work: abort every turn synchronously first, then close the
   * Runtime sessions (each close is internally bounded) and join what remains.
   * Destroy only releases references, so a stop that ran out of budget cannot
   * leave live work behind a torn-down listener surface.
   */
  protected override async onStop(): Promise<void> {
    this.acceptingSubmissions = false;
    const reason = new Error('The Agent Host is stopping.');
    this.lifecycleAbortController.abort(reason);
    for (const state of this.activeTurns.values()) {
      state.abortController.abort(reason);
    }
    for (const admission of this.admittingSessions.values()) {
      admission.abortController.abort(reason);
    }
    for (const admission of this.initialAdmissions) {
      admission.abortController.abort(reason);
    }
    await Promise.allSettled(
      [...this.admittingSessions.values(), ...this.initialAdmissions].map(
        ({ completion }) => completion,
      ),
    );
    // An admission already committing its reservation may have installed a
    // turn while the first abort pass was running.
    for (const state of this.activeTurns.values()) {
      state.abortController.abort(reason);
    }
    const closing = [...this.runtimeSessions.values()].map(({ session }) =>
      session
        .close()
        .catch((error) =>
          logger.warn('Failed to close a runtime session during stop', error as Error),
        ),
    );
    this.runtimeSessions.clear();
    await Promise.allSettled(closing);
    await Promise.allSettled(this.runningTurns);
    await this.naming.drain();
    await this.usage.drain();
  }

  protected override onDestroy(): void {
    this.runningTurnsBySession.clear();
    this.listeners.clear();
    this.observingSessions.clear();
  }

  async reconcileInterruptedTurns(): Promise<number> {
    return this.store.reconcileInterrupted(INTERRUPTED_ERROR);
  }

  // ── Protocol operations ──

  async startSession(input: AgentStartSessionInput): Promise<AgentSessionView> {
    const parsed = AgentStartSessionInputSchema.parse(input);
    this.assertAcceptingSubmissions();
    const completion = createCompletionSignal();
    const abortController = new AbortController();
    const admission = { abortController, completion: completion.promise };
    const { signal } = abortController;
    this.initialAdmissions.add(admission);
    let openedRuntimeSession: AgentRuntimeSession | undefined;
    let isRuntimeSessionInstalled = false;

    try {
      const plan = await prepareInitialTurn(this.turnPreparation, parsed, signal);
      openedRuntimeSession = await this.openRuntimeSession(plan.runtime, signal);
      signal.throwIfAborted();

      const reserved = await this.store.reserveInitialSubmission({
        agentId: parsed.agentId,
        executionTarget: parsed.executionTarget,
        userParts: plan.userParts,
        modelId: plan.inferenceSnapshot.model.uniqueModelId,
        inferenceSnapshot: plan.inferenceSnapshot,
      });
      const { session } = reserved;
      this.runtimeSessions.set(session.id, {
        runtimeId: plan.runtime.descriptor.id,
        session: openedRuntimeSession,
      });
      isRuntimeSessionInstalled = true;
      this.startReservedTurn(
        session.id,
        session.title,
        plan,
        reserved,
        openedRuntimeSession,
        abortController,
      );
      return session;
    } finally {
      if (openedRuntimeSession && !isRuntimeSessionInstalled) {
        await openedRuntimeSession
          .close()
          .catch((error) =>
            logger.warn('Failed to close an unused Runtime session', error as Error),
          );
      }
      this.initialAdmissions.delete(admission);
      completion.resolve();
    }
  }

  async forkSession(input: AgentForkSessionInput): Promise<AgentSessionView> {
    const parsed = AgentForkSessionInputSchema.parse(input);
    // A fork point must be a clean cut (agent-protocol.md "Branching" rule 1).
    // Rejecting the whole operation while a turn is live is stricter than
    // checking the anchor alone, and it keeps the store from silently dropping
    // an anchor that is itself the streaming row.
    this.assertIdle(parsed.sessionId);

    const result = await this.store.forkSession(parsed);
    switch (result.status) {
      case 'session-not-found':
        fail('SESSION_NOT_FOUND', `Session does not exist: ${parsed.sessionId}`);
        break;
      case 'message-not-found':
        fail(
          'MESSAGE_NOT_FOUND',
          `Message does not exist in this session: ${parsed.fromMessageId}`,
        );
        break;
      case 'fork-point-unsettled':
        fail('SESSION_BUSY', 'The fork point has not settled yet.');
        break;
      case 'forked':
        return result.session;
    }
  }

  async renameSession(input: { sessionId: string; title: string }): Promise<AgentSessionView> {
    const parsed = AgentRenameSessionInputSchema.parse(input);
    const session = await this.store.renameSession(parsed.sessionId, parsed.title);
    if (!session) {
      fail('SESSION_NOT_FOUND', `Session does not exist: ${parsed.sessionId}`);
    }
    this.updateBackgroundReplyTitle(session.id, session.title);
    this.publish(parsed.sessionId, { type: 'session.updated', session });
    return session;
  }

  async deleteSession(input: { sessionId: string }): Promise<void> {
    const parsed = AgentDeleteSessionInputSchema.parse(input);
    const { sessionId } = parsed;
    if (this.deletingSessions.has(sessionId)) {
      fail('SESSION_BUSY', 'The session is already being deleted.');
    }
    // Install the barrier before the first await: submissions that begin after
    // this point fail closed, while an already-admitted submission may finish
    // installing its active/running state for us to cancel and drain below.
    this.deletingSessions.add(sessionId);
    try {
      const observations = this.observingSessions.get(sessionId);
      if (observations) {
        await Promise.allSettled([...observations]);
      }
      const admission = this.admittingSessions.get(sessionId);
      if (admission) {
        await admission.completion;
      }
      const active = this.activeTurns.get(sessionId);
      if (active) {
        await this.cancelTurn({ sessionId, turnId: active.turn.id });
      }
      const runningTurn = this.runningTurnsBySession.get(sessionId);
      if (runningTurn) {
        await runningTurn;
      }
      const cached = this.runtimeSessions.get(sessionId);
      if (cached) {
        this.runtimeSessions.delete(sessionId);
        await cached.session.close();
      }
      this.backgroundReply.clearSession(sessionId);
      const deleted = await this.store.deleteSession(sessionId);
      if (!deleted) {
        fail('SESSION_NOT_FOUND', `Session does not exist: ${sessionId}`);
      }
      this.listeners.delete(sessionId);
    } finally {
      this.deletingSessions.delete(sessionId);
    }
  }

  async submitMessage(
    input: AgentSubmitMessageInput,
  ): Promise<{ turnId: string; userMessageId: string; assistantMessageId: string }> {
    const parsed = AgentSubmitMessageInputSchema.parse(input);
    const { sessionId } = parsed;
    this.assertIdle(sessionId);
    // Synchronous admission guard: a second submit that interleaves at any
    // await below still fails SESSION_BUSY (invariant 1).
    const completion = createCompletionSignal();
    const abortController = new AbortController();
    const { signal } = abortController;
    this.admittingSessions.set(sessionId, {
      abortController,
      completion: completion.promise,
    });
    try {
      // Every gate between admission and the first durable write lives in the
      // preparation stage; a failure there leaves nothing to reconcile.
      const plan = await prepareTurn(this.turnPreparation, parsed, signal);

      // Open the Runtime before creating durable pending rows. A failed open
      // must leave no reservation that startup reconciliation has to repair.
      const runtimeSession = await this.getRuntimeSession(sessionId, plan.runtime, signal);
      signal.throwIfAborted();

      // Invariant 2: reservation commits before execution starts.
      const reserved = await this.store.reserveSubmission({
        sessionId,
        userParts: plan.userParts,
        modelId: plan.inferenceSnapshot.model.uniqueModelId,
        inferenceSnapshot: plan.inferenceSnapshot,
      });

      return this.startReservedTurn(
        sessionId,
        plan.sessionTitle,
        plan,
        reserved,
        runtimeSession,
        abortController,
      );
    } finally {
      this.admittingSessions.delete(sessionId);
      completion.resolve();
    }
  }

  async cancelTurn(input: { sessionId: string; turnId: string }): Promise<void> {
    const parsed = AgentCancelTurnInputSchema.parse(input);
    const active = this.activeTurns.get(parsed.sessionId);
    if (!active || active.turn.id !== parsed.turnId) {
      return; // invariant 6: idempotent, including after the turn settled
    }
    if (active.turn.status !== 'cancelling') {
      active.turn = { ...active.turn, status: 'cancelling' };
      this.publish(parsed.sessionId, { type: 'turn.updated', turn: active.turn });
    }
    active.abortController.abort(new Error('The turn was cancelled.'));
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
    if (this.deletingSessions.has(sessionId)) {
      fail('SESSION_BUSY', 'The session is being deleted.');
    }
    const completion = createCompletionSignal();
    const observations = this.observingSessions.get(sessionId) ?? new Set<Promise<void>>();
    observations.add(completion.promise);
    this.observingSessions.set(sessionId, observations);

    try {
      const session = await this.store.getSession(sessionId);
      if (!session) {
        fail('SESSION_NOT_FOUND', `Session does not exist: ${sessionId}`);
      }
      const agent = await this.requireAgent(session.agentId);
      const capabilities = this.projectCapabilities(session.executionTarget);
      if (this.deletingSessions.has(sessionId)) {
        fail('SESSION_BUSY', 'The session is being deleted.');
      }

      // Snapshot capture and listener registration are one synchronous section:
      // no event can fall into a snapshot/subscription gap (invariant 8).
      const active = this.activeTurns.get(sessionId);
      const snapshot = AgentSessionSnapshotSchema.parse(
        cloneJson({
          agent: { id: agent.id, name: agent.name },
          session,
          capabilities,
          activeTurn: active?.turn ?? null,
          activeUserMessage: active?.activeUserMessage ?? null,
          hasHistoryBeforeActiveTurn: active?.hasHistoryBeforeActiveTurn ?? null,
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
          if (sessionListeners.size === 0 && this.listeners.get(sessionId) === sessionListeners) {
            this.listeners.delete(sessionId);
          }
        },
      };
    } finally {
      observations.delete(completion.promise);
      if (observations.size === 0 && this.observingSessions.get(sessionId) === observations) {
        this.observingSessions.delete(sessionId);
      }
      completion.resolve();
    }
  }

  private startReservedTurn(
    sessionId: string,
    sessionTitle: string,
    plan: TurnPlan,
    reserved: ReserveSubmissionResult,
    runtimeSession: AgentRuntimeSession,
    abortController: AbortController,
  ): { turnId: string; userMessageId: string; assistantMessageId: string } {
    // The Turn projection starts here: reservation time is the turn start.
    const turn: AgentTurnView = {
      id: reserved.turnId,
      sessionId,
      status: 'running',
      assistantMessageId: reserved.assistantMessage.id,
      error: null,
      startedAt: reserved.assistantMessage.createdAt,
      endedAt: null,
    };
    const state: ActiveTurnState = {
      agent: plan.agent,
      abortController,
      turn,
      activeUserMessage: reserved.userMessage,
      assistantMessage: reserved.assistantMessage,
      autoNamePromise: null,
      autoNameUserParts: plan.hasMessages ? null : plan.inputParts,
      backgroundReply: this.startBackgroundReply({
        agentId: plan.agent.id,
        agentName: plan.agent.name,
        sessionId,
        sessionTitle,
      }),
      hasHistoryBeforeActiveTurn: plan.hasMessages,
      pendingApprovals: new Map(),
      pendingContextCheckpoint: null,
      resources: plan.resources,
      sessionTurnIds: new Set([...plan.sessionTurnIds, reserved.turnId]),
      usage: null,
      runtimeSession,
    };
    this.activeTurns.set(sessionId, state);

    this.publish(sessionId, { type: 'message.created', message: reserved.userMessage });
    this.publish(sessionId, { type: 'message.created', message: reserved.assistantMessage });
    this.publish(sessionId, { type: 'turn.updated', turn });
    if (state.autoNameUserParts && !abortController.signal.aborted) {
      state.autoNamePromise = this.naming.maybeRenameFromFirstUserMessage(
        sessionId,
        state.autoNameUserParts,
      );
      this.publishSessionRename(state.autoNamePromise);
    }

    const run = this.runTurn(sessionId, plan, state);
    this.runningTurns.add(run);
    this.runningTurnsBySession.set(sessionId, run);
    void run.finally(() => {
      this.runningTurns.delete(run);
      if (this.runningTurnsBySession.get(sessionId) === run) {
        this.runningTurnsBySession.delete(sessionId);
      }
    });

    return {
      turnId: reserved.turnId,
      userMessageId: reserved.userMessage.id,
      assistantMessageId: reserved.assistantMessage.id,
    };
  }

  // ── Execution ──

  private async runTurn(sessionId: string, plan: TurnPlan, state: ActiveTurnState): Promise<void> {
    try {
      const runtimeAttachments = await materializeRuntimeAttachments({
        files: this.files,
        history: plan.history,
        inputParts: plan.inputParts,
        modelPreflight: plan.modelPreflight,
        resources: state.resources,
        signal: state.abortController.signal,
        textAttachments: plan.runtimeTextAttachments,
      });
      state.abortController.signal.throwIfAborted();
      const events = state.runtimeSession.execute({
        turnId: state.turn.id,
        instructions: plan.agent.instructions,
        model: plan.agent.model,
        history: toRuntimeHistory(plan.history, runtimeAttachments),
        contextCheckpoint: plan.runtimeContextCheckpoint,
        input: toRuntimeInputParts(plan.inputParts, state.resources, runtimeAttachments),
        tools: [...plan.tools],
        options: plan.agent.options,
      });
      for await (const event of events) {
        const isTerminal = await this.handleRuntimeEvent(sessionId, state, event);
        if (MESSAGE_SURFACE_EVENTS.has(event.type)) {
          state.backgroundReply.update(state.assistantMessage);
        }
        if (isTerminal) {
          return;
        }
      }
      // Defensive: a conforming runtime always emits a terminal event.
      await this.finalize(
        sessionId,
        state,
        'failed',
        toAgentErrorView({
          code: 'missing_terminal_event',
          message: 'The runtime ended without a terminal event.',
          retryable: false,
          origin: 'host',
        }),
      );
    } catch (error) {
      if (error instanceof TerminalPersistenceError) {
        this.handleTerminalPersistenceFailure(sessionId, state, error);
        return;
      }
      if (state.abortController.signal.aborted) {
        try {
          await this.finalize(sessionId, state, 'cancelled', null);
        } catch (finalizeError) {
          this.handleTerminalPersistenceFailure(sessionId, state, finalizeError);
        }
        return;
      }
      logger.error('Agent turn failed outside the runtime event stream', error as Error);
      try {
        await this.finalize(
          sessionId,
          state,
          'failed',
          toAgentErrorView({
            code: 'host_error',
            message: 'The turn failed unexpectedly.',
            retryable: false,
            origin: 'host',
            ...(error instanceof Error ? { name: error.name } : {}),
          }),
        );
      } catch (finalizeError) {
        this.handleTerminalPersistenceFailure(sessionId, state, finalizeError);
      }
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
        if (part.type === 'file') {
          // A Host-validated artifact joins the turn ledger, so the model may
          // reference it later in this same turn (monotonic grant, never a
          // tool-side widening).
          state.resources.grantFile(part.fileEntryId);
        }
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
        // Approvals and live turn status are Host state by design: they never
        // survive a restart (agent-persistence.md).
        const approval = toAgentApprovalView(event.approval, sessionId);
        state.pendingApprovals.set(approval.id, approval);
        state.turn = { ...state.turn, status: 'awaiting-approval' };
        state.backgroundReply.awaitApproval(state.assistantMessage);
        this.publish(sessionId, { type: 'turn.updated', turn: state.turn });
        this.publish(sessionId, { type: 'approval.requested', approval });
        return false;
      }
      case 'approval.resolved': {
        const approval = toAgentApprovalView(event.approval, sessionId);
        state.pendingApprovals.set(approval.id, approval);
        const hasPending = [...state.pendingApprovals.values()].some(
          (entry) => entry.status === 'pending',
        );
        if (!hasPending && state.turn.status === 'awaiting-approval') {
          state.turn = { ...state.turn, status: 'running' };
          this.publish(sessionId, { type: 'turn.updated', turn: state.turn });
        }
        this.publish(sessionId, { type: 'approval.resolved', approval });
        return false;
      }
      case 'usage': {
        // Cumulative; the last report before the terminal event is authoritative.
        state.usage = {
          completedAt: event.completedAt,
          context: event.context,
          usage: event.usage,
        };
        return false;
      }
      case 'context.checkpoint': {
        const validation = validateRuntimeContextCheckpoint(event.checkpoint, state.sessionTurnIds);
        if (validation.issue) {
          state.pendingContextCheckpoint = null;
          logger.warn('Agent context checkpoint rejected before persistence', {
            code: validation.issue,
            sessionId,
          });
        } else {
          state.pendingContextCheckpoint = validation.checkpoint;
        }
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
    const parts: AgentMessagePart[] = interruptNonTerminalToolParts(
      state.assistantMessage.parts.map((part) =>
        (part.type === 'text' || part.type === 'reasoning') && part.state === 'streaming'
          ? { ...part, state: 'done' }
          : part,
      ),
      'The turn ended before this tool call completed.',
    );
    if (outcome === 'failed' && error) {
      parts.push({ id: `error-${state.turn.id}`, type: 'error', error });
    }
    const messageStatus =
      outcome === 'completed' ? 'success' : outcome === 'failed' ? 'error' : 'cancelled';

    // Invariant 5: the terminal message state (including the turn-level error)
    // commits before the terminal events publish. The terminal turn view is a
    // projection of that committed message.
    const finalized = await this.persistTerminalState({
      assistantMessageId: state.assistantMessage.id,
      status: messageStatus,
      parts,
      usage: state.usage ? toAgentUsageView(state.usage.usage) : null,
      error,
      contextCheckpoint: outcome === 'completed' ? state.pendingContextCheckpoint : null,
    });
    const turn: AgentTurnView = {
      ...state.turn,
      status: outcome,
      error,
      endedAt: finalized.updatedAt,
    };

    if (this.activeTurns.get(sessionId) === state) {
      this.activeTurns.delete(sessionId);
    }
    if (outcome === 'failed' && error) {
      logger.error('Agent turn reached a failed terminal state', {
        assistantMessageId: finalized.id,
        durationMs: Math.max(0, Date.parse(finalized.updatedAt) - Date.parse(state.turn.startedAt)),
        hasUsage: state.usage !== null,
        modelId: error.failure?.context?.modelId ?? state.agent.model.modelId,
        providerId: error.failure?.context?.providerId ?? state.agent.model.providerId,
        reasonCode: error.failure?.reasonCode ?? 'unknown',
        retryable: error.retryable,
        sessionId,
        sourceCode: error.failure?.source.code,
        sourceLayer: error.failure?.source.layer,
        statusCode: error.failure?.context?.statusCode,
        totalTokens: state.usage?.usage.totalTokens,
        turnId: state.turn.id,
      });
    }
    if (state.usage) {
      this.usage.record({
        agent: state.agent,
        assistantMessageId: finalized.id,
        report: state.usage,
        turnId: state.turn.id,
      });
    }
    this.publish(sessionId, { type: 'message.finalized', message: finalized });
    this.publish(sessionId, { type: 'turn.updated', turn });
    const namingPromises = state.autoNamePromise ? [state.autoNamePromise] : [];
    if (outcome === 'completed' && state.autoNameUserParts) {
      const summaryNamePromise = this.naming.maybeRenameFromConversationSummary({
        assistantParts: finalized.parts,
        sessionId,
        userParts: state.autoNameUserParts,
      });
      namingPromises.push(summaryNamePromise);
      this.publishSessionRename(summaryNamePromise);
    }
    state.backgroundReply.finish(
      outcome,
      namingPromises.length > 0 ? { waitFor: Promise.allSettled(namingPromises) } : undefined,
    );
  }

  private async persistTerminalState(
    input: Parameters<AgentSessionStore['finalizeAssistantMessage']>[0],
  ): Promise<AgentMessageView> {
    let lastFailure: unknown;
    for (const delayMs of TERMINAL_PERSISTENCE_RETRY_DELAYS_MS) {
      if (delayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
      try {
        return await this.store.finalizeAssistantMessage(input);
      } catch (error) {
        lastFailure = error;
      }
    }
    throw new TerminalPersistenceError(lastFailure);
  }

  private handleTerminalPersistenceFailure(
    sessionId: string,
    state: ActiveTurnState,
    error: unknown,
  ): void {
    // There is no valid volatile terminal projection without its durable row.
    // Fail the entire Host generation closed and retain the active turn; the
    // next generation's startup reconciliation will mark the placeholder
    // interrupted once persistence is available again.
    this.acceptingSubmissions = false;
    const failure = error instanceof TerminalPersistenceError ? error.failure : error;
    logger.error(
      'Agent Host entered a fatal state after terminal persistence failed',
      failure as Error,
      {
        assistantMessageId: state.assistantMessage.id,
        sessionId,
        turnId: state.turn.id,
      },
    );
  }

  // ── Helpers ──

  private assertAcceptingSubmissions(): void {
    if (!this.acceptingSubmissions) {
      fail('EXECUTION_UNAVAILABLE', 'The Agent Host is stopping.');
    }
  }

  private assertIdle(sessionId: string): void {
    this.assertAcceptingSubmissions();
    if (this.deletingSessions.has(sessionId)) {
      fail('SESSION_BUSY', 'The session is being deleted.');
    }
    if (this.activeTurns.has(sessionId) || this.admittingSessions.has(sessionId)) {
      fail('SESSION_BUSY', 'The session already has an active turn.');
    }
  }

  private async requireAgent(agentId: string): Promise<AgentDefinition> {
    const agent = await this.agents.getAgent(agentId);
    if (!agent) {
      fail('AGENT_NOT_FOUND', `Agent does not exist: ${agentId}`);
    }
    return agent;
  }

  private routeExecutionTarget(target: AgentExecutionTarget): AgentRuntime {
    if (target.kind !== 'local') {
      fail('EXECUTION_UNAVAILABLE', 'No runtime can execute this Agent configuration.');
    }
    return this.runtime;
  }

  private projectCapabilities(target: AgentExecutionTarget): AgentCapabilities {
    const runtime = this.routeExecutionTarget(target);
    return { ...runtime.descriptor.capabilities };
  }

  private startBackgroundReply(input: {
    agentId: string;
    agentName: string;
    sessionId: string;
    sessionTitle: string;
  }): BackgroundReplyTurn {
    try {
      return this.backgroundReply.startTurn(input);
    } catch (error) {
      logger.warn('Failed to start Agent Session background reply', error as Error, {
        sessionId: input.sessionId,
      });
      this.backgroundReply.clearSession(input.sessionId);
      return NOOP_BACKGROUND_REPLY_TURN;
    }
  }

  /**
   * One Pi Runtime session per active application Session. The descriptor check
   * keeps the cache safe for tests that replace the injected Runtime.
   */
  private async getRuntimeSession(
    sessionId: string,
    runtime: AgentRuntime,
    signal: AbortSignal,
  ): Promise<AgentRuntimeSession> {
    signal.throwIfAborted();
    const cached = this.runtimeSessions.get(sessionId);
    if (cached && cached.runtimeId === runtime.descriptor.id) {
      return cached.session;
    }
    if (cached) {
      this.runtimeSessions.delete(sessionId);
      await raceAbort(cached.session.close(), signal);
    }
    const session = await this.openRuntimeSession(runtime, signal);
    this.runtimeSessions.set(sessionId, { runtimeId: runtime.descriptor.id, session });
    return session;
  }

  private async openRuntimeSession(
    runtime: AgentRuntime,
    signal: AbortSignal,
  ): Promise<AgentRuntimeSession> {
    signal.throwIfAborted();
    const opening = runtime.open();
    try {
      const session = await raceAbort(opening, signal);
      signal.throwIfAborted();
      return session;
    } catch (error) {
      if (signal.aborted) {
        void opening
          .then((session) => session.close())
          .catch((closeError: unknown) =>
            logger.warn('Failed to close an aborted runtime session open', closeError as Error),
          );
      }
      throw error;
    }
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

  private updateBackgroundReplyTitle(sessionId: string, title: string): void {
    try {
      this.backgroundReply.updateSessionTitle(sessionId, title);
    } catch (error) {
      logger.warn('Failed to update Agent Session background reply title', error as Error, {
        sessionId,
      });
    }
  }

  private publishSessionRename(promise: Promise<AgentSessionView | null>): void {
    void promise
      .then((session) => {
        if (session) {
          this.updateBackgroundReplyTitle(session.id, session.title);
          this.publish(session.id, { type: 'session.updated', session });
        }
      })
      .catch((error: unknown) => {
        logger.warn('Agent Session auto-naming failed', error as Error);
      });
  }
}
