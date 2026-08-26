/**
 * Mobile Agent Host: the only adapter between the Agent Protocol
 * (`@/shared/contracts/agent`) and the Agent Runtime contract
 * (`@/backend/ai/agent`), per docs/references/agent/.
 *
 * The Host owns Agent lookup, Session persistence, the local Runtime binding, the
 * streaming overlay, snapshots, and lifecycle recovery. It is an app-owned
 * lifecycle service (one per ApplicationHost generation):
 * route unmount only unsubscribes; disposal cancels and awaits active turns.
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
 */

import type {
  AgentRuntime,
  AgentRuntimeSession,
  RuntimeContextCheckpoint,
  RuntimeEvent,
  RuntimeInputPart,
  RuntimeModelPreflight,
  RuntimeTool,
  RuntimeUsageReport,
} from '@/backend/ai/agent';
import { PiRuntime } from '@/backend/ai/agent';
import type { AiService } from '@/backend/ai/AiService';
import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import { modelService } from '@/backend/data/services/ModelService';
import { providerService } from '@/backend/data/services/ProviderService';
import type {
  BackgroundReplyLifecycle,
  BackgroundReplyTurn,
} from '@/backend/services/backgroundReply';
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
  type AgentSubmitMessageInput,
  type AgentTurnView,
} from '@/shared/contracts/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { FileEntryIdSchema } from '@/shared/data/types/file';
import { parseUniqueModelId } from '@/shared/data/types/model';
import { isAiSupportedImageMediaType } from '@/shared/utils/imageFileTypes';

import {
  createAgentTableDefinitionSource,
  type AgentDefinition,
  type AgentDefinitionSource,
} from './agentDefinitions';
import { AgentSessionNaming } from './AgentSessionNaming';
import type { AgentSessionStore } from './AgentSessionStore';
import { AgentSessionUsageRecorder } from './AgentSessionUsageRecorder';
import { selectRuntimeContext, validateRuntimeContextCheckpoint } from './contextCheckpoints';
import { findImageAttachmentLimit, type ImageAttachmentLimit } from './imageAttachments';
import {
  createAgentInferenceSnapshot,
  type AgentInferenceModelResolver,
  resolveAgentInferenceModel,
} from './inferenceSnapshot';
import {
  createTurnResourceLedger,
  managedFileResolver,
  type ManagedFileResolver,
  type TurnResourceLedger,
} from './managedFileResolver';
import {
  interruptNonTerminalToolParts,
  toAgentApprovalView,
  toAgentErrorView,
  toAgentMessagePart,
  toAgentUsageView,
  toRuntimeHistory,
  toRuntimeInputParts,
  type RuntimeFileContents,
} from './mapping';
import { createPiModelResolver } from './piModelResolver';
import { type AgentToolSource, createBuiltInToolSource } from './tools/builtInToolSource';

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

type MobileAgentHostOverrides = {
  agents: AgentDefinitionSource;
  files: ManagedFileResolver;
  inferenceModel: AgentInferenceModelResolver;
  naming: Pick<
    AgentSessionNaming,
    'drain' | 'maybeRenameFromConversationSummary' | 'maybeRenameFromFirstUserMessage'
  >;
  usage: Pick<AgentSessionUsageRecorder, 'drain' | 'record'>;
  tools: AgentToolSource;
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
  assistantMessage: AgentMessageView;
  autoNamePromise: Promise<AgentSessionView | null> | null;
  autoNameUserParts: AgentInputPart[] | null;
  backgroundReply: BackgroundReplyTurn;
  pendingApprovals: Map<string, AgentApprovalView>;
  pendingContextCheckpoint: RuntimeContextCheckpoint | null;
  resources: TurnResourceLedger;
  sessionTurnIds: Set<string>;
  usage: RuntimeUsageReport | null;
  runtimeSession: AgentRuntimeSession;
};

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
@DependsOn(['AgentSessionStore', 'AiService', 'PreferenceService', 'BackgroundReplyRuntime'])
@AppStatePolicy('continue')
export class MobileAgentHost extends BaseService implements AgentProtocol {
  private readonly listeners = new Map<string, Set<(event: AgentEvent) => void>>();
  private readonly activeTurns = new Map<string, ActiveTurnState>();
  private readonly admittingSessions = new Map<string, Promise<void>>();
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

  /**
   * Lifecycle composition supplies the selected store adapter. Production
   * binds `local` directly to Pi; tests may replace the Runtime and Agent ports.
   */
  constructor(
    private readonly store: AgentSessionStore,
    aiService: AiService,
    preferenceService: PreferenceService,
    private readonly backgroundReply: BackgroundReplyLifecycle,
    private readonly runtime: AgentRuntime = new PiRuntime(createPiModelResolver()),
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
        store,
      });
    this.usage = overrides.usage ?? new AgentSessionUsageRecorder();
    this.inferenceModel = overrides.inferenceModel ?? resolveAgentInferenceModel;
  }

  private get agents(): AgentDefinitionSource {
    return this.overrides.agents ?? (this.lazyAgents ??= createAgentTableDefinitionSource());
  }

  private lazyAgents: AgentDefinitionSource | undefined;

  private get toolSource(): AgentToolSource {
    return this.overrides.tools ?? (this.lazyTools ??= createBuiltInToolSource());
  }

  private lazyTools: AgentToolSource | undefined;

  /** Reconcile any unfinished state available from the selected store. */
  protected override async onInit(): Promise<void> {
    await this.reconcileInterruptedTurns();
  }

  protected override async onDestroy(): Promise<void> {
    for (const state of this.activeTurns.values()) {
      state.abortController.abort(new Error('The Agent Host was disposed.'));
    }
    for (const { session } of this.runtimeSessions.values()) {
      try {
        await session.close();
      } catch (error) {
        logger.warn('Failed to close a runtime session during disposal', error as Error);
      }
    }
    this.runtimeSessions.clear();
    await Promise.allSettled([...this.runningTurns]);
    await this.naming.drain();
    await this.usage.drain();
    this.runningTurnsBySession.clear();
    this.listeners.clear();
  }

  async reconcileInterruptedTurns(): Promise<number> {
    return this.store.reconcileInterrupted(INTERRUPTED_ERROR);
  }

  // ── Protocol operations ──

  async createSession(input: {
    agentId: string;
    executionTarget: AgentExecutionTarget;
    title?: string;
  }): Promise<AgentSessionView> {
    const parsed = AgentCreateSessionInputSchema.parse(input);
    const agent = await this.agents.getAgent(parsed.agentId);
    if (!agent) {
      fail('AGENT_NOT_FOUND', `Agent does not exist: ${parsed.agentId}`);
    }
    return this.store.createSession({
      agentId: parsed.agentId,
      title: parsed.title,
    });
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
      const admission = this.admittingSessions.get(sessionId);
      if (admission) {
        await admission;
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
    const admission = createCompletionSignal();
    this.admittingSessions.set(sessionId, admission.promise);
    try {
      const session = await this.store.getSession(sessionId);
      if (!session) {
        fail('SESSION_NOT_FOUND', `Session does not exist: ${sessionId}`);
      }
      const configuredAgent = await this.requireAgent(session.agentId);
      const agent = applyTurnOverrides(configuredAgent, parsed);
      const runtime = this.routeExecutionTarget(session.executionTarget);

      // Frozen for the turn, so mid-turn configuration changes cannot alter it.
      // Tools are an enhancement: if the catalog cannot be resolved the turn
      // still runs, tool-less.
      let tools: readonly RuntimeTool[] = [];
      if (runtime.descriptor.capabilities.tools) {
        try {
          tools = await this.toolSource.getTools(agent.model);
        } catch (error) {
          logger.warn('Failed to resolve Agent tools; running this turn tool-less', error as Error);
        }
      }

      const inferenceModel = await this.inferenceModel(agent.model).catch(() =>
        fail('EXECUTION_UNAVAILABLE', 'The selected model is unavailable.'),
      );
      const inferenceSnapshot = createAgentInferenceSnapshot({
        model: inferenceModel,
        options: agent.options,
        tools,
      });

      // History is everything stored before this turn.
      const priorMessages = await this.store.listMessages(sessionId);
      const storedContextCandidate = await this.store.getLatestContextCheckpoint(sessionId);
      const runtimeContext = selectRuntimeContext(
        priorMessages,
        storedContextCandidate?.checkpoint ?? null,
      );
      if (runtimeContext.issue) {
        logger.warn('Agent context checkpoint rejected; replaying full history', {
          code: runtimeContext.issue,
          checkpointMessageId: storedContextCandidate?.assistantMessageId,
          sessionId,
        });
      }
      const { availableFiles, inputFiles, parts } = await this.resolveManagedInput(
        parsed.parts,
        priorMessages,
      );
      const resources = createTurnResourceLedger(inputFiles, priorMessages, availableFiles);
      const modelPreflight = await this.preflightModel(runtime, agent);
      this.assertImageRequestSupported(
        runtime,
        parts,
        runtimeContext.history,
        resources,
        modelPreflight,
      );

      const userParts: AgentMessagePart[] = parts.map((part, index) =>
        part.type === 'text'
          ? { id: `input-${index}`, type: 'text', text: part.text, state: 'done' }
          : {
              id: `input-${index}`,
              type: 'file',
              fileEntryId: part.fileEntryId,
              mediaType: part.mediaType,
              ...(part.name !== undefined ? { name: part.name } : {}),
              purpose: 'input-attachment',
            },
      );

      // Invariant 2: reservation commits before execution starts.
      const reserved = await this.store.reserveSubmission({
        sessionId,
        userParts,
        modelId: inferenceSnapshot.model.uniqueModelId,
        inferenceSnapshot,
      });
      const runtimeSession = await this.getRuntimeSession(sessionId, runtime);

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
        agent,
        abortController: new AbortController(),
        turn,
        assistantMessage: reserved.assistantMessage,
        autoNamePromise: null,
        autoNameUserParts: priorMessages.length === 0 ? parts : null,
        backgroundReply: this.startBackgroundReply({
          agentId: agent.id,
          agentName: agent.name,
          sessionId,
          sessionTitle: session.title,
        }),
        pendingApprovals: new Map(),
        pendingContextCheckpoint: null,
        resources,
        sessionTurnIds: new Set([
          ...priorMessages.flatMap((message) => (message.turnId ? [message.turnId] : [])),
          reserved.turnId,
        ]),
        usage: null,
        runtimeSession,
      };
      this.activeTurns.set(sessionId, state);

      this.publish(sessionId, { type: 'message.created', message: reserved.userMessage });
      this.publish(sessionId, { type: 'message.created', message: reserved.assistantMessage });
      this.publish(sessionId, { type: 'turn.updated', turn });
      if (state.autoNameUserParts) {
        state.autoNamePromise = this.naming.maybeRenameFromFirstUserMessage(
          sessionId,
          state.autoNameUserParts,
        );
        this.publishSessionRename(state.autoNamePromise);
      }

      const run = this.runTurn(
        sessionId,
        agent,
        state,
        runtimeContext.history,
        parts,
        runtimeContext.checkpoint,
        tools,
      );
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
    } finally {
      this.admittingSessions.delete(sessionId);
      admission.resolve();
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
    const session = await this.store.getSession(sessionId);
    if (!session) {
      fail('SESSION_NOT_FOUND', `Session does not exist: ${sessionId}`);
    }
    const agent = await this.requireAgent(session.agentId);
    const capabilities = this.projectCapabilities(session.executionTarget);

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
    history: AgentMessageView[],
    inputParts: AgentInputPart[],
    storedContextCheckpoint: RuntimeContextCheckpoint | null,
    tools: readonly RuntimeTool[],
  ): Promise<void> {
    try {
      const runtimeFiles = await this.resolveRuntimeFiles(
        state.resources,
        state.abortController.signal,
      );
      state.abortController.signal.throwIfAborted();
      const events = state.runtimeSession.execute({
        turnId: state.turn.id,
        instructions: agent.instructions,
        model: agent.model,
        history: toRuntimeHistory(history, runtimeFiles),
        contextCheckpoint: storedContextCheckpoint,
        input: toRuntimeInputParts(inputParts, state.resources, runtimeFiles),
        tools: [...tools],
        options: agent.options,
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
      if (state.abortController.signal.aborted) {
        await this.finalize(sessionId, state, 'cancelled', null).catch(() => undefined);
        return;
      }
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
        state.backgroundReply.update(state.assistantMessage);
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
        state.backgroundReply.update(state.assistantMessage);
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
        state.backgroundReply.update(state.assistantMessage);
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
        state.backgroundReply.update(state.assistantMessage);
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
    const finalized = await this.store.finalizeAssistantMessage({
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

  // ── Helpers ──

  private async resolveManagedInput(parts: AgentInputPart[], history: AgentMessageView[]) {
    const fileEntryIds = parts.flatMap((part) => {
      if (part.type !== 'file') {
        return [];
      }
      const parsed = FileEntryIdSchema.safeParse(part.fileEntryId);
      if (!parsed.success) {
        fail('ATTACHMENT_UNAVAILABLE', 'An attached file is no longer available.');
      }
      return [parsed.data];
    });

    const historicalFileEntryIds = history.flatMap((message) =>
      message.parts.flatMap((part) => {
        if (part.type !== 'file' || part.purpose !== 'input-attachment') {
          return [];
        }
        const parsed = FileEntryIdSchema.safeParse(part.fileEntryId);
        return parsed.success ? [parsed.data] : [];
      }),
    );
    let availableFiles: Awaited<ReturnType<ManagedFileResolver['resolveAvailable']>> = new Map();
    if (fileEntryIds.length > 0 || historicalFileEntryIds.length > 0) {
      try {
        availableFiles = await this.files.resolveAvailable([
          ...fileEntryIds,
          ...historicalFileEntryIds,
        ]);
      } catch {
        fail('ATTACHMENT_UNAVAILABLE', 'An attached file could not be verified.');
      }
    }

    const inputFiles = new Map(
      fileEntryIds.flatMap((fileEntryId) => {
        const fact = availableFiles.get(fileEntryId);
        return fact ? [[fileEntryId, fact] as const] : [];
      }),
    );

    const canonicalParts = parts.map((part): AgentInputPart => {
      if (part.type !== 'file') {
        return part;
      }
      const fact = inputFiles.get(part.fileEntryId);
      if (!fact) {
        fail('ATTACHMENT_UNAVAILABLE', 'An attached file is no longer available.');
      }
      if (
        part.mediaType !== fact.mediaType ||
        (part.name !== undefined && part.name !== fact.name)
      ) {
        fail('ATTACHMENT_METADATA_MISMATCH', 'Attached file metadata could not be verified.');
      }
      return {
        type: 'file',
        fileEntryId: fact.fileEntryId,
        mediaType: fact.mediaType,
        name: fact.name,
      };
    });

    return { availableFiles, inputFiles, parts: canonicalParts };
  }

  private async preflightModel(
    runtime: AgentRuntime,
    agent: AgentDefinition,
  ): Promise<RuntimeModelPreflight> {
    try {
      return await runtime.preflightModel(agent.model);
    } catch {
      fail(
        'CAPABILITY_UNSUPPORTED',
        'The selected model or provider endpoint cannot execute this turn.',
      );
    }
  }

  private assertImageRequestSupported(
    runtime: AgentRuntime,
    input: AgentInputPart[],
    history: AgentMessageView[],
    resources: TurnResourceLedger,
    model: RuntimeModelPreflight,
  ): void {
    const images = input.flatMap((part) => {
      if (part.type !== 'file') {
        return [];
      }
      const fact = resources.inputFiles.get(part.fileEntryId);
      if (!fact || !isAiSupportedImageMediaType(fact.mediaType)) {
        fail(
          'CAPABILITY_UNSUPPORTED',
          'Only managed JPEG, PNG, GIF, and WebP images are supported.',
        );
      }
      return [fact];
    });

    for (const message of history) {
      for (const part of message.parts) {
        if (part.type !== 'file' || part.purpose !== 'input-attachment') {
          continue;
        }
        const fact = resources.availableFiles.get(part.fileEntryId);
        if (fact && isAiSupportedImageMediaType(fact.mediaType)) {
          images.push(fact);
        }
      }
    }

    if (images.length === 0) {
      return;
    }
    if (!runtime.descriptor.capabilities.attachments || !model.inputModalities.includes('image')) {
      fail('CAPABILITY_UNSUPPORTED', 'The selected model does not support image input.');
    }

    const limit = findImageAttachmentLimit(images, model);
    if (limit) {
      fail('CAPABILITY_UNSUPPORTED', imageAttachmentLimitMessage(limit));
    }
  }

  private async resolveRuntimeFiles(
    resources: TurnResourceLedger,
    signal: AbortSignal,
  ): Promise<RuntimeFileContents> {
    const files = new Map<string, Extract<RuntimeInputPart, { type: 'file' }>>();
    for (const fact of resources.availableFiles.values()) {
      if (!isAiSupportedImageMediaType(fact.mediaType)) {
        continue;
      }
      try {
        const uri = await this.files.readAsDataUrl(fact, signal);
        signal.throwIfAborted();
        if (!uri || !uri.startsWith(`data:${fact.mediaType};base64,`)) {
          if (resources.inputFiles.has(fact.fileEntryId)) {
            throw new Error('A current managed image became unavailable.');
          }
          continue;
        }
        files.set(fact.fileEntryId, {
          type: 'file',
          mediaType: fact.mediaType,
          name: fact.name,
          uri,
        });
      } catch {
        if (signal.aborted) {
          throw signal.reason ?? new Error('Managed image resolution was aborted.');
        }
        if (resources.inputFiles.has(fact.fileEntryId)) {
          throw new Error('A current managed image could not be read.');
        }
      }
    }
    return files;
  }

  private assertIdle(sessionId: string): void {
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

function applyTurnOverrides(
  agent: AgentDefinition,
  input: Pick<AgentSubmitMessageInput, 'modelId' | 'reasoningEffort'>,
): AgentDefinition {
  if (input.modelId === undefined && input.reasoningEffort === undefined) {
    return agent;
  }

  const options = { ...agent.options };
  if (input.reasoningEffort !== undefined) {
    if (input.reasoningEffort === 'default' || input.reasoningEffort === 'auto') {
      // Pi resolves an absent effort to the selected model's default. Removing
      // the Agent setting here makes an explicit composer "default" win.
      delete options.reasoningEffort;
    } else {
      options.reasoningEffort = input.reasoningEffort === 'none' ? 'off' : input.reasoningEffort;
    }
  }

  return {
    ...agent,
    ...(input.modelId ? { model: parseUniqueModelId(input.modelId) } : {}),
    options,
  };
}

function imageAttachmentLimitMessage(limit: ImageAttachmentLimit): string {
  switch (limit) {
    case 'count':
      return 'Too many images are attached to this request.';
    case 'file-bytes':
      return 'An attached image exceeds the per-file size limit.';
    case 'total-bytes':
      return 'The attached images exceed the total request size limit.';
    case 'context':
      return 'The attached images exceed the selected model context budget.';
  }
}
