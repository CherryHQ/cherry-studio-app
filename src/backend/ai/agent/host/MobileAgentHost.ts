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

import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type {
  BackgroundReplyLifecycle,
  BackgroundReplyTurn,
} from '@/backend/services/backgroundReply';
import {
  AgentCancelTurnInputSchema,
  AgentDeleteSessionInputSchema,
  AgentForkSessionInputSchema,
  AgentRenameSessionInputSchema,
  AgentRespondApprovalInputSchema,
  AgentStartSessionInputSchema,
  AgentSubmitMessageInputSchema,
  AgentEditQueuedInputSchema,
  AgentPromoteQueuedInputSchema,
  AgentReorderQueuedInputsSchema,
  AgentPauseInputQueueSchema,
  AgentQueuedInputIdentitySchema,
  AgentSessionSnapshotSchema,
  AgentProtocolError,
  type AgentApprovalView,
  type AgentCapabilities,
  type AgentErrorView,
  type AgentEvent,
  type AgentExecutionTarget,
  type AgentForkSessionInput,
  type AgentInputPart,
  type AgentInferenceSnapshotV1,
  type AgentSessionInput,
  type AgentSubmitMessageResult,
  type AgentEditQueuedInput,
  type AgentPromoteQueuedInput,
  type AgentReorderQueuedInputs,
  type AgentPauseInputQueue,
  type AgentQueuedInputIdentity,
  type AgentInputQueueReason,
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
import type { LanguageVarious } from '@/shared/data/preference';
import { createUniqueModelId } from '@/shared/data/types/model';

import type { ManagedFileResolver, TurnResourceLedger } from '../resources/managedFileResolver';
import type {
  AgentRuntime,
  AgentRuntimeSession,
  RuntimeContextCheckpoint,
  RuntimeEvent,
  RuntimeUsageReport,
} from '../runtime';
import { raceAbort } from '../runtime';
import type {
  AgentSessionStore,
  EnqueueSessionInput,
  ReserveSubmissionResult,
  FinalizeAssistantMessageInput,
} from '../sessionStore/AgentSessionStore';
import {
  interruptNonTerminalToolParts,
  settleStreamingTextParts,
} from '../sessionStore/messageSettlement';
import type { SystemCapabilitySource } from '../tools/builtInToolSource';
import type { AgentRuntimeToolResolver } from '../tools/runtimeTools';
import type { AgentDefinition, AgentDefinitionSource } from './agentDefinitions';
import type { AgentSessionNaming } from './AgentSessionNaming';
import type { AgentSessionUsageRecorder } from './AgentSessionUsageRecorder';
import { buildAgentSystemPrompt } from './agentSystemPrompt';
import { validateRuntimeContextCheckpoint } from './contextCheckpoints';
import type { AgentInferenceModelResolver } from './inferenceSnapshot';
import { MessageRuntimeTimingCollector } from './MessageRuntimeTimingCollector';
import {
  toAgentApprovalView,
  toAgentErrorView,
  toAgentMessagePart,
  toAgentUsageView,
} from './runtimeProjection';
import { materializeRuntimeAttachments, resolveManagedInput } from './turnAttachments';
import {
  prepareInitialTurn,
  prepareTurn,
  applyTurnOverrides,
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

export type MobileAgentHostNaming = Pick<
  AgentSessionNaming,
  'drain' | 'maybeRenameFromConversationSummary' | 'maybeRenameFromFirstUserMessage'
>;

/**
 * Everything the Host needs from the application, as narrow ports. Production
 * assembles them in `AgentHostDependencies`; tests hand in fakes. The Host
 * never constructs a collaborator itself.
 */
export type MobileAgentHostPorts = {
  agents: AgentDefinitionSource;
  appLanguage: () => LanguageVarious;
  files: ManagedFileResolver;
  inferenceModel: AgentInferenceModelResolver;
  /** Bound to the Host's lifecycle signal so stopping the Host aborts naming. */
  naming(signal: AbortSignal): MobileAgentHostNaming;
  runtimeTools: AgentRuntimeToolResolver;
  usage: Pick<AgentSessionUsageRecorder, 'drain' | 'record'>;
  tools: SystemCapabilitySource;
};

/**
 * The Host owns the Turn projection (agent-persistence.md): the store persists
 * messages and input receipts, live turn state exists here, and the terminal turn view is
 * derived from the settled assistant message.
 */
type ActiveTurnState = {
  agent: AgentDefinition;
  abortController: AbortController;
  turn: AgentTurnView;
  activeUserMessage: AgentMessageView;
  assistantMessage: AgentMessageView;
  inferenceSnapshot: AgentInferenceSnapshotV1;
  autoNamePromise: Promise<AgentSessionView | null> | null;
  autoNameUserParts: AgentInputPart[] | null;
  backgroundReply: BackgroundReplyTurn;
  hasHistoryBeforeActiveTurn: boolean;
  pendingApprovals: Map<string, AgentApprovalView>;
  pendingContextCheckpoint: RuntimeContextCheckpoint | null;
  resources: TurnResourceLedger;
  runtimeTiming: MessageRuntimeTimingCollector;
  sessionTurnIds: Set<string>;
  /** Set by a durable-value event; cleared when a snapshot write picks it up. */
  snapshotDirty: boolean;
  /** The single in-flight snapshot writer, or null when none is running. */
  snapshotFlush: Promise<void> | null;
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

/**
 * True when the event adds value a restart could not regenerate: a tool
 * result or a file reference. Text and non-terminal tool states ride along in
 * the next snapshot; `interrupted` parts only ever precede the terminal write.
 */
function isDurableValueEvent(event: RuntimeEvent): boolean {
  if (event.type !== 'part.add' && event.type !== 'part.replace') {
    return false;
  }
  const { part } = event;
  return (
    part.type === 'file' ||
    (part.type === 'tool' &&
      (part.state === 'output-available' || part.state === 'denied' || part.state === 'error'))
  );
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
// catalogs: `AgentHostDependencies` declares them, so the edge reaches this
// Host transitively. Covered by a stop-order test.
@DependsOn(['AgentSessionStore', 'AgentHostDependencies', 'BackgroundReplyRuntime', 'AgentRuntime'])
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
  /** Serializes queue mutations and snapshot capture, never waits for a running turn. */
  private readonly inputOperations = new Map<string, Promise<void>>();
  private readonly naming: MobileAgentHostNaming;
  private readonly lifecycleAbortController = new AbortController();
  private acceptingSubmissions = true;

  /**
   * Lifecycle composition supplies the selected store adapter, the Host's
   * ports, and the Runtime bound at the composition root (`AgentRuntime`
   * registration); tests hand in fakes for all of them.
   */
  constructor(
    private readonly store: AgentSessionStore,
    private readonly ports: MobileAgentHostPorts,
    private readonly backgroundReply: BackgroundReplyLifecycle,
    private readonly runtime: AgentRuntime,
  ) {
    super();
    this.naming = ports.naming(this.lifecycleAbortController.signal);
  }

  private get files(): ManagedFileResolver {
    return this.ports.files;
  }

  private get usage(): MobileAgentHostPorts['usage'] {
    return this.ports.usage;
  }

  /** Ports for the write-free preparation stage, read per call so a port may resolve lazily. */
  private get turnPreparation(): TurnPreparationDependencies {
    return {
      agents: this.ports.agents,
      files: this.ports.files,
      inferenceModel: this.ports.inferenceModel,
      routeExecutionTarget: (target) => this.routeExecutionTarget(target),
      runtimeTools: this.ports.runtimeTools,
      store: this.store,
      systemCapabilities: this.ports.tools,
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
    await Promise.allSettled(this.inputOperations.values());
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
    this.inputOperations.clear();
  }

  async reconcileInterruptedTurns(): Promise<number> {
    const reconciled = await this.store.reconcileInterrupted(INTERRUPTED_ERROR);
    // Recovery runs at PostReady, after the first paint, so a Session screen
    // may already observe one of these Sessions with its placeholder rendered
    // as pending. Publishing the settled row refreshes it in place.
    for (const message of reconciled) {
      this.publish(message.sessionId, { type: 'message.finalized', message });
    }
    for (const sessionId of this.listeners.keys()) {
      await this.withInputOperation(sessionId, () => this.publishInputQueue(sessionId));
    }
    return reconciled.length;
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
      await this.inputOperations.get(sessionId);
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

  async submitMessage(input: AgentSubmitMessageInput): Promise<AgentSubmitMessageResult> {
    const parsed = AgentSubmitMessageInputSchema.parse(input);
    // Pin the intent before any await; an omitted target must never steer a newer turn.
    const targetTurnId = parsed.targetTurnId ?? this.activeTurns.get(parsed.sessionId)?.turn.id;
    for (;;) {
      const result = await this.withInputOperation(parsed.sessionId, async () => {
        this.assertSessionWritable(parsed.sessionId);
        const active = this.activeTurns.get(parsed.sessionId);
        const predecessor = this.runningTurnsBySession.get(parsed.sessionId);
        if (predecessor && (!active || active.turn.status === 'cancelling')) {
          return { predecessor };
        }
        return { submission: await this.acceptInput({ ...parsed, targetTurnId }) };
      });
      if (result.submission) return result.submission;
      // Stop then send joins the previous execution and persistence outside the queue lock.
      await result.predecessor;
    }
  }

  private async acceptInput(input: AgentSubmitMessageInput): Promise<AgentSubmitMessageResult> {
    const signal = this.lifecycleAbortController.signal;
    const existing = await raceAbort(this.store.getInput(input.inputId), signal);
    if (existing) {
      if (existing.sessionId !== input.sessionId || existing.status === 'removed') {
        fail('INPUT_UNAVAILABLE', 'This input identity is no longer available in this Session.');
      }
      return submissionResult(existing);
    }
    const session = await raceAbort(this.requireSession(input.sessionId), signal);
    const configuredAgent = await raceAbort(this.requireAgent(session.agentId), signal);
    const agent = applyTurnOverrides(configuredAgent, input);
    if (
      !this.runtime.descriptor.capabilities.attachments &&
      input.parts.some((part) => part.type === 'file')
    ) {
      fail('CAPABILITY_UNSUPPORTED', 'File attachments are not supported for this Agent.');
    }
    const queued: EnqueueSessionInput = {
      id: input.inputId,
      sessionId: input.sessionId,
      parts: input.parts,
      mode: input.mode ?? 'follow-up',
      targetTurnId: input.targetTurnId,
      modelId: createUniqueModelId(agent.model.providerId, agent.model.modelId),
      reasoningEffort:
        agent.options.reasoningEffort === 'off'
          ? 'none'
          : (agent.options.reasoningEffort ?? 'default'),
    };
    const queue = await raceAbort(this.store.getInputQueue(input.sessionId), signal);
    const active = this.activeTurns.get(input.sessionId);
    if (!active && !this.runningTurnsBySession.has(input.sessionId) && queue.inputs.length === 0) {
      return this.startInput(queued, true);
    }
    const { parts } = await resolveManagedInput(
      this.files,
      input.parts,
      [],
      this.lifecycleAbortController.signal,
    );
    this.assertSessionWritable(input.sessionId);
    const { input: stored } = await this.store.enqueueInput({ ...queued, parts });
    const result = await this.redirectInput(stored, active);
    await this.publishInputQueue(input.sessionId);
    this.requestQueueDrain(input.sessionId);
    return result;
  }

  /** Resolves fresh history and configuration immediately before reserving a queued input. */
  private async startInput(
    input: EnqueueSessionInput,
    isNew: boolean,
  ): Promise<AgentSubmitMessageResult> {
    this.assertAcceptingSubmissions();
    const sessionId = input.sessionId;
    const completion = createCompletionSignal();
    const abortController = new AbortController();
    const { signal } = abortController;
    this.admittingSessions.set(sessionId, { abortController, completion: completion.promise });
    try {
      const plan = await prepareTurn(this.turnPreparation, input, signal);
      const runtimeSession = await this.getRuntimeSession(sessionId, plan.runtime, signal);
      signal.throwIfAborted();
      if (isNew) {
        await this.store.enqueueInput({ ...input, parts: plan.inputParts });
        // A fresh explicit send into an empty queue starts even after a prior stop.
        await this.store.setInputQueuePaused(sessionId, false);
      }
      const dispatching = await this.store.updateInput({
        id: input.id,
        sessionId,
        expectedStatus: ['queued'],
        patch: { status: 'dispatching', reason: null },
      });
      if (!dispatching) fail('INPUT_UNAVAILABLE', 'The queued input is no longer available.');
      const reserved = await this.store.consumeInput({
        inputId: input.id,
        sessionId,
        userParts: plan.userParts,
        modelId: plan.inferenceSnapshot.model.uniqueModelId,
        inferenceSnapshot: plan.inferenceSnapshot,
      });
      const started = this.startReservedTurn(
        sessionId,
        plan.sessionTitle,
        plan,
        reserved,
        runtimeSession,
        abortController,
      );
      await this.publishInputQueue(sessionId);
      return { inputId: input.id, disposition: 'started', ...started };
    } catch (error) {
      const stored = await this.store.getInput(input.id);
      if (!stored || stored.status === 'consumed') throw error;
      const reason = error instanceof AgentProtocolError ? 'invalid-input' : 'runtime-unavailable';
      const retained = await this.store.updateInput({
        id: input.id,
        sessionId,
        expectedStatus: ['queued', 'dispatching'],
        patch: { status: 'queued', reason },
      });
      await this.store.setInputQueuePaused(sessionId, true);
      await this.publishInputQueue(sessionId);
      logger.warn('Queued input could not start; queue paused', {
        inputId: input.id,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return submissionResult(retained ?? stored);
    } finally {
      this.admittingSessions.delete(sessionId);
      completion.resolve();
    }
  }

  private async redirectInput(
    input: AgentSessionInput,
    active: ActiveTurnState | undefined,
  ): Promise<AgentSubmitMessageResult> {
    let reason: AgentInputQueueReason = 'busy';
    if (input.mode === 'steer') {
      if (!active || active.turn.id !== input.targetTurnId || active.turn.status === 'cancelling') {
        reason = 'target-ended';
      } else if (
        input.parts.some((part) => part.type !== 'text') ||
        !input.parts.some((part) => part.type === 'text' && part.text.trim())
      ) {
        reason = 'unsupported-content';
      } else {
        const requestedAgent = applyTurnOverrides(active.agent, input);
        if (
          createUniqueModelId(requestedAgent.model.providerId, requestedAgent.model.modelId) !==
            active.inferenceSnapshot.model.uniqueModelId ||
          requestedAgent.options.reasoningEffort !== active.agent.options.reasoningEffort
        ) {
          reason = 'configuration-changed';
        } else {
          const steering = await this.store.updateInput({
            id: input.id,
            sessionId: input.sessionId,
            expectedStatus: ['queued'],
            patch: { status: 'steering', reason: null },
          });
          if (!steering) fail('INPUT_UNAVAILABLE', 'The input is no longer queued.');
          const accepted = await active.runtimeSession
            .steer({
              turnId: active.turn.id,
              inputId: input.id,
              text: input.parts
                .flatMap((part) => (part.type === 'text' ? [part.text] : []))
                .join('\n'),
            })
            .catch(async (error: unknown) => {
              // An exception cannot prove whether native injection happened. Cancellation
              // returns known leftovers; terminal settlement interrupts any unresolved ids.
              await this.store.setInputQueuePaused(input.sessionId, true);
              active.abortController.abort(error);
              void active.runtimeSession
                .cancel(active.turn.id)
                .catch((cancelError: unknown) =>
                  logger.warn(
                    'Failed to cancel an uncertain steering submission',
                    cancelError as Error,
                  ),
                );
              logger.warn(
                'Steering acceptance failed; input retained for recovery',
                error as Error,
              );
              return null;
            });
          if (accepted === null)
            return { inputId: input.id, disposition: 'queued', reason: 'runtime-unavailable' };
          if (accepted)
            return { inputId: input.id, disposition: 'redirected', turnId: active.turn.id };
          reason = 'runtime-unavailable';
        }
      }
    }
    const retained = await this.store.updateInput({
      id: input.id,
      sessionId: input.sessionId,
      expectedStatus: ['queued', 'steering'],
      patch: { status: 'queued', reason },
    });
    return submissionResult(retained ?? input);
  }

  async editQueuedInput(input: AgentEditQueuedInput): Promise<void> {
    const parsed = AgentEditQueuedInputSchema.parse(input);
    await this.withInputOperation(parsed.sessionId, async () => {
      this.assertSessionWritable(parsed.sessionId);
      const { parts } = await resolveManagedInput(
        this.files,
        parsed.parts,
        [],
        this.lifecycleAbortController.signal,
      );
      const updated = await this.store.updateInput({
        id: parsed.inputId,
        sessionId: parsed.sessionId,
        expectedStatus: ['queued', 'interrupted'],
        patch: { parts },
      });
      if (!updated) fail('INPUT_UNAVAILABLE', 'Only unconsumed queued inputs can be edited.');
      await this.publishInputQueue(parsed.sessionId);
    });
  }

  async removeQueuedInput(input: AgentQueuedInputIdentity): Promise<void> {
    const parsed = AgentQueuedInputIdentitySchema.parse(input);
    await this.withInputOperation(parsed.sessionId, async () => {
      this.assertSessionWritable(parsed.sessionId);
      const updated = await this.store.updateInput({
        id: parsed.inputId,
        sessionId: parsed.sessionId,
        expectedStatus: ['queued', 'interrupted'],
        patch: { status: 'removed' },
      });
      if (!updated) fail('INPUT_UNAVAILABLE', 'Only unconsumed queued inputs can be removed.');
      await this.publishInputQueue(parsed.sessionId);
    });
    this.requestQueueDrain(parsed.sessionId);
  }

  async retryQueuedInput(input: AgentQueuedInputIdentity): Promise<void> {
    const parsed = AgentQueuedInputIdentitySchema.parse(input);
    await this.withInputOperation(parsed.sessionId, async () => {
      this.assertSessionWritable(parsed.sessionId);
      const updated = await this.store.updateInput({
        id: parsed.inputId,
        sessionId: parsed.sessionId,
        expectedStatus: ['queued', 'interrupted'],
        patch: { status: 'queued', reason: null },
      });
      if (!updated) fail('INPUT_UNAVAILABLE', 'The input is no longer available for retry.');
      await this.publishInputQueue(parsed.sessionId);
    });
    this.requestQueueDrain(parsed.sessionId);
  }

  async promoteQueuedInput(input: AgentPromoteQueuedInput): Promise<AgentSubmitMessageResult> {
    const parsed = AgentPromoteQueuedInputSchema.parse(input);
    return this.withInputOperation(parsed.sessionId, async () => {
      this.assertSessionWritable(parsed.sessionId);
      const updated = await this.store.updateInput({
        id: parsed.inputId,
        sessionId: parsed.sessionId,
        expectedStatus: ['queued'],
        patch: { mode: 'steer', targetTurnId: parsed.targetTurnId },
      });
      if (!updated) fail('INPUT_UNAVAILABLE', 'Only queued inputs can be promoted.');
      const result = await this.redirectInput(updated, this.activeTurns.get(parsed.sessionId));
      await this.publishInputQueue(parsed.sessionId);
      return result;
    });
  }

  async reorderQueuedInputs(input: AgentReorderQueuedInputs): Promise<void> {
    const parsed = AgentReorderQueuedInputsSchema.parse(input);
    await this.withInputOperation(parsed.sessionId, async () => {
      this.assertSessionWritable(parsed.sessionId);
      if (!(await this.store.reorderInputs(parsed.sessionId, parsed.inputIds)))
        fail('INPUT_UNAVAILABLE', 'The queue changed before it could be reordered.');
      await this.publishInputQueue(parsed.sessionId);
    });
    this.requestQueueDrain(parsed.sessionId);
  }

  async pauseInputQueue(input: AgentPauseInputQueue): Promise<void> {
    const parsed = AgentPauseInputQueueSchema.parse(input);
    await this.withInputOperation(parsed.sessionId, async () => {
      this.assertSessionWritable(parsed.sessionId);
      await this.requireSession(parsed.sessionId);
      await this.store.setInputQueuePaused(parsed.sessionId, parsed.isPaused);
      await this.publishInputQueue(parsed.sessionId);
    });
    if (!parsed.isPaused) this.requestQueueDrain(parsed.sessionId);
  }

  private requestQueueDrain(sessionId: string): void {
    void this.withInputOperation(sessionId, async () => {
      if (
        !this.acceptingSubmissions ||
        this.deletingSessions.has(sessionId) ||
        this.activeTurns.has(sessionId) ||
        this.admittingSessions.has(sessionId) ||
        this.runningTurnsBySession.has(sessionId)
      )
        return;
      const queue = await this.store.getInputQueue(sessionId);
      const next = queue.inputs[0];
      if (queue.isPaused || !next) return;
      if (next.status !== 'queued') {
        await this.store.setInputQueuePaused(sessionId, true);
        await this.publishInputQueue(sessionId);
        return;
      }
      await this.startInput(next, false);
    }).catch((error: unknown) =>
      logger.warn('Agent input queue drain failed', error as Error, { sessionId }),
    );
  }

  private async publishInputQueue(sessionId: string): Promise<void> {
    this.publish(sessionId, {
      type: 'queue.updated',
      sessionId,
      queue: await this.store.getInputQueue(sessionId),
    });
  }

  private withInputOperation<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.inputOperations.get(sessionId) ?? Promise.resolve();
    const result = previous.then(operation);
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    this.inputOperations.set(sessionId, settled);
    void settled.then(() => {
      if (this.inputOperations.get(sessionId) === settled) this.inputOperations.delete(sessionId);
    });
    return result;
  }

  async cancelTurn(input: { sessionId: string; turnId: string }): Promise<void> {
    const parsed = AgentCancelTurnInputSchema.parse(input);
    const active = this.activeTurns.get(parsed.sessionId);
    if (!active || active.turn.id !== parsed.turnId || active.turn.endedAt !== null) {
      return; // invariant 6: idempotent, including after the turn settled
    }
    if (active.turn.status !== 'cancelling') {
      active.turn = { ...active.turn, status: 'cancelling' };
      this.publish(parsed.sessionId, { type: 'turn.updated', turn: active.turn });
    }
    active.abortController.abort(new Error('The turn was cancelled.'));
    const pause = this.withInputOperation(parsed.sessionId, async () => {
      await this.store.setInputQueuePaused(parsed.sessionId, true);
      await this.publishInputQueue(parsed.sessionId);
    });
    await Promise.all([pause, active.runtimeSession.cancel(parsed.turnId)]);
    await this.runningTurnsBySession.get(parsed.sessionId);
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

      return await this.withInputOperation(sessionId, async () => {
        const inputQueue = await this.store.getInputQueue(sessionId);
        if (this.deletingSessions.has(sessionId))
          fail('SESSION_BUSY', 'The session is being deleted.');
        // Snapshot capture and listener registration are one synchronous section:
        // no event can fall into a snapshot/subscription gap (invariant 8).
        const active = this.activeTurns.get(sessionId);
        const snapshot = AgentSessionSnapshotSchema.parse(
          cloneJson({
            agent: { id: agent.id, name: agent.name },
            session,
            capabilities,
            inputQueue,
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
      });
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
    // Match desktop timing ownership: execution starts when the Host launches
    // the Runtime, independently from the placeholder row's creation time.
    const runtimeStartedAt = Date.now();
    const runtimeTiming = new MessageRuntimeTimingCollector(undefined, runtimeStartedAt);
    const turn: AgentTurnView = {
      id: reserved.turnId,
      sessionId,
      status: 'running',
      assistantMessageId: reserved.assistantMessage.id,
      error: null,
      startedAt: new Date(runtimeStartedAt).toISOString(),
      endedAt: null,
    };
    const state: ActiveTurnState = {
      agent: plan.agent,
      abortController,
      turn,
      activeUserMessage: reserved.userMessage,
      assistantMessage: reserved.assistantMessage,
      inferenceSnapshot: plan.inferenceSnapshot,
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
      runtimeTiming,
      sessionTurnIds: new Set([...plan.sessionTurnIds, reserved.turnId]),
      snapshotDirty: false,
      snapshotFlush: null,
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
      this.requestQueueDrain(sessionId);
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
        instructions: buildAgentSystemPrompt({
          agentInstructions: plan.agent.instructions,
          appLanguage: this.ports.appLanguage(),
          tools: plan.tools,
        }),
        model: plan.agent.model,
        history: toRuntimeHistory(plan.history, runtimeAttachments),
        contextCheckpoint: plan.runtimeContextCheckpoint,
        input: toRuntimeInputParts(plan.inputParts, state.resources, runtimeAttachments),
        tools: [...plan.tools],
        options: plan.agent.options,
        // Pi pauses at each consumed-input boundary until this collector is replaced.
        runtimeTimingSink: {
          onToolExecutionStart: (event) => state.runtimeTiming.sink.onToolExecutionStart(event),
          onToolExecutionEnd: (event) => state.runtimeTiming.sink.onToolExecutionEnd(event),
        },
      });
      for await (const event of events) {
        const isTerminal = await this.handleRuntimeEvent(sessionId, state, event);
        if (isDurableValueEvent(event)) {
          this.requestSnapshot(sessionId, state);
        }
        if (MESSAGE_SURFACE_EVENTS.has(event.type)) {
          if (event.type === 'text.delta') {
            state.backgroundReply.update(state.assistantMessage, { deferPreview: true });
          } else {
            state.backgroundReply.update(state.assistantMessage);
          }
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
      const wasCancelled = state.abortController.signal.aborted;
      state.abortController.abort(error);
      await state.runtimeSession.cancel(state.turn.id).catch((cancelError: unknown) => {
        logger.warn('Failed to cancel after a Host event-stream failure', cancelError as Error);
      });
      if (error instanceof TerminalPersistenceError) {
        this.handleTerminalPersistenceFailure(sessionId, state, error);
        return;
      }
      if (wasCancelled) {
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
      case 'input.consumed':
        await this.withInputOperation(sessionId, () =>
          this.consumeSteeringInput(sessionId, state, event),
        );
        return false;
      case 'input.undelivered':
        await this.withInputOperation(sessionId, async () => {
          await this.store.updateInput({
            id: event.inputId,
            sessionId,
            expectedStatus: ['steering'],
            patch: { status: 'queued', reason: 'undelivered' },
          });
          await this.publishInputQueue(sessionId);
        });
        return false;
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
        state.runtimeTiming.startApproval(approval.id, approval.toolCallId, approval.displayName);
        state.pendingApprovals.set(approval.id, approval);
        state.turn = { ...state.turn, status: 'awaiting-approval' };
        state.backgroundReply.awaitApproval(state.assistantMessage);
        this.publish(sessionId, { type: 'turn.updated', turn: state.turn });
        this.publish(sessionId, { type: 'approval.requested', approval });
        return false;
      }
      case 'approval.resolved': {
        const approval = toAgentApprovalView(event.approval, sessionId);
        state.runtimeTiming.finishApproval({ approvalId: approval.id });
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
        // Cumulative within this segment; consumption starts a new accumulator.
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

  private async consumeSteeringInput(
    sessionId: string,
    state: ActiveTurnState,
    event: Extract<RuntimeEvent, { type: 'input.consumed' }>,
  ): Promise<void> {
    const input = await this.store.getInput(event.inputId);
    if (
      input?.sessionId === sessionId &&
      input.status === 'consumed' &&
      input.turnId === state.turn.id
    )
      return;
    if (
      !input ||
      input.sessionId !== sessionId ||
      input.status !== 'steering' ||
      input.targetTurnId !== state.turn.id
    ) {
      throw new Error('The Runtime consumed an input that was not steering this turn.');
    }
    if ([...state.pendingApprovals.values()].some((approval) => approval.status === 'pending')) {
      throw new Error('The Runtime consumed steering before pending approvals settled.');
    }
    const previous = this.segmentFinalization(state, 'completed', null, event.consumedAt);
    previous.contextCheckpoint = null;
    await state.snapshotFlush;
    let reserved: Awaited<ReturnType<AgentSessionStore['consumeInput']>>;
    try {
      reserved = await this.store.consumeInput({
        inputId: input.id,
        sessionId,
        userParts: input.parts.map<AgentMessagePart>((part, index) => {
          if (part.type !== 'text') throw new Error('Steering supports text only.');
          return { id: `input-${index}`, type: 'text', text: part.text, state: 'done' };
        }),
        modelId: state.inferenceSnapshot.model.uniqueModelId,
        inferenceSnapshot: state.inferenceSnapshot,
        continuation: { turnId: state.turn.id, previousAssistant: previous },
      });
    } catch (error) {
      // Native consumption already happened. Never turn an ambiguous write into automatic replay.
      state.abortController.abort(error);
      void state.runtimeSession
        .cancel(state.turn.id)
        .catch((cancelError: unknown) =>
          logger.warn(
            'Failed to cancel after a steering boundary write failed',
            cancelError as Error,
          ),
        );
      throw new TerminalPersistenceError(error);
    }
    const finalized = reserved.previousAssistantMessage;
    if (!finalized)
      throw new Error('The steering transaction did not return the previous segment.');
    if (state.usage)
      this.usage.record({
        agent: state.agent,
        assistantMessageId: finalized.id,
        report: state.usage,
        turnId: state.turn.id,
      });
    if (state.autoNameUserParts)
      state.autoNameUserParts = [...state.autoNameUserParts, ...input.parts];
    state.activeUserMessage = reserved.userMessage;
    state.assistantMessage = reserved.assistantMessage;
    state.turn = { ...state.turn, assistantMessageId: reserved.assistantMessage.id };
    state.runtimeTiming = new MessageRuntimeTimingCollector(undefined, event.consumedAt);
    state.usage = null;
    // Route handoff must load the persisted prefix before this live pair, even within turn 1.
    state.hasHistoryBeforeActiveTurn = true;
    state.snapshotDirty = false;
    this.publish(sessionId, { type: 'message.finalized', message: finalized });
    this.publish(sessionId, { type: 'message.created', message: reserved.userMessage });
    this.publish(sessionId, { type: 'message.created', message: reserved.assistantMessage });
    this.publish(sessionId, { type: 'turn.updated', turn: state.turn });
    state.backgroundReply.update(state.assistantMessage);
    await this.publishInputQueue(sessionId);
  }

  private segmentFinalization(
    state: ActiveTurnState,
    outcome: 'completed' | 'failed' | 'cancelled',
    error: AgentErrorView | null,
    completedAt: number,
  ): FinalizeAssistantMessageInput {
    state.runtimeTiming.closeOpenSpans(completedAt);
    state.runtimeTiming.complete(completedAt);
    const timing = state.runtimeTiming.snapshot();
    const parts = interruptNonTerminalToolParts(
      settleStreamingTextParts(state.assistantMessage.parts),
      'The turn ended before this tool call completed.',
    );
    if (outcome === 'failed' && error)
      parts.push({ id: `error-${state.turn.id}`, type: 'error', error });
    return {
      assistantMessageId: state.assistantMessage.id,
      status: outcome === 'completed' ? 'success' : outcome === 'failed' ? 'error' : 'cancelled',
      parts,
      usage: state.usage ? toAgentUsageView(state.usage.usage) : null,
      error,
      contextCheckpoint: outcome === 'completed' ? state.pendingContextCheckpoint : null,
      runtimeStats: {
        runtimeTiming: {
          ...timing,
          completedAt: timing.completedAt ?? Math.max(timing.startedAt, completedAt),
        },
      },
    };
  }

  private async finalize(
    sessionId: string,
    state: ActiveTurnState,
    outcome: 'completed' | 'failed' | 'cancelled',
    error: AgentErrorView | null,
  ): Promise<void> {
    if (outcome === 'completed' && state.abortController.signal.aborted) outcome = 'cancelled';
    const terminalInput = this.segmentFinalization(state, outcome, error, Date.now());
    const runtimeTiming = terminalInput.runtimeStats.runtimeTiming;
    await state.snapshotFlush;
    // Terminal persistence precedes queue release, events, and automatic follow-ups.
    const finalized = await this.persistTerminalState(terminalInput);
    await this.withInputOperation(sessionId, async () => {
      const queue = await this.store.getInputQueue(sessionId);
      let hasAmbiguousInput = false;
      for (const input of queue.inputs) {
        if (input.status === 'steering') {
          hasAmbiguousInput = true;
          await this.store.updateInput({
            id: input.id,
            sessionId,
            expectedStatus: ['steering'],
            patch: { status: 'interrupted', reason: 'interrupted' },
          });
        }
      }
      if (outcome !== 'completed' || hasAmbiguousInput)
        await this.store.setInputQueuePaused(sessionId, true);
      await this.publishInputQueue(sessionId);
    }).catch((failure: unknown) => {
      throw new TerminalPersistenceError(failure);
    });
    const turn: AgentTurnView = {
      ...state.turn,
      status: outcome,
      error,
      endedAt: new Date(runtimeTiming.completedAt).toISOString(),
    };

    if (this.activeTurns.get(sessionId) === state) {
      this.activeTurns.delete(sessionId);
    }
    if (outcome === 'failed' && error) {
      const failureLayer = error.failure?.source.layer;
      // Provider and tool failures are expected outcomes the transcript already
      // shows; only an app-owned layer indicates a defect worth the error level
      // and the development overlay it raises.
      const logFailure =
        failureLayer === 'provider' || failureLayer === 'tool'
          ? logger.warn.bind(logger)
          : logger.error.bind(logger);
      logFailure('Agent turn reached a failed terminal state', {
        assistantMessageId: finalized.id,
        durationMs: Math.max(0, runtimeTiming.completedAt - runtimeTiming.startedAt),
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
    const initialNamePromise = state.autoNamePromise;
    if (outcome === 'completed' && state.autoNameUserParts) {
      const summaryNamePromise = this.naming.maybeRenameFromConversationSummary({
        assistantParts: finalized.parts,
        sessionId,
        userParts: state.autoNameUserParts,
      });
      this.publishSessionRename(summaryNamePromise);
    }
    state.backgroundReply.finish(
      outcome,
      initialNamePromise ? { waitFor: initialNamePromise } : undefined,
    );
  }

  /**
   * Coalesces snapshot writes: the event loop never waits on the store, one
   * write is in flight at a time, and a burst of durable-value events collapses
   * into the single write that starts after the in-flight one settles.
   */
  private requestSnapshot(sessionId: string, state: ActiveTurnState): void {
    state.snapshotDirty = true;
    state.snapshotFlush ??= this.flushSnapshots(sessionId, state);
  }

  private async flushSnapshots(sessionId: string, state: ActiveTurnState): Promise<void> {
    try {
      while (state.snapshotDirty) {
        state.snapshotDirty = false;
        await this.persistStreamingMessage(sessionId, state.assistantMessage);
      }
    } finally {
      state.snapshotFlush = null;
    }
  }

  private async persistStreamingMessage(
    sessionId: string,
    assistantMessage: AgentMessageView,
  ): Promise<void> {
    try {
      await this.store.updateStreamingAssistantMessage({
        assistantMessageId: assistantMessage.id,
        parts: assistantMessage.parts,
      });
    } catch (error) {
      logger.warn('Agent streaming message write failed; recovery fidelity reduced', {
        assistantMessageId: assistantMessage.id,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });
    }
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

  private assertSessionWritable(sessionId: string): void {
    this.assertAcceptingSubmissions();
    if (this.deletingSessions.has(sessionId)) fail('SESSION_BUSY', 'The session is being deleted.');
  }

  private async requireSession(sessionId: string): Promise<AgentSessionView> {
    const session = await this.store.getSession(sessionId);
    if (!session) fail('SESSION_NOT_FOUND', `Session does not exist: ${sessionId}`);
    return session;
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
    const agent = await this.ports.agents.getAgent(agentId);
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

function submissionResult(input: AgentSessionInput): AgentSubmitMessageResult {
  if (
    input.status === 'consumed' &&
    input.turnId &&
    input.userMessageId &&
    input.assistantMessageId
  ) {
    return {
      inputId: input.id,
      disposition: 'started',
      turnId: input.turnId,
      userMessageId: input.userMessageId,
      assistantMessageId: input.assistantMessageId,
    };
  }
  if (input.status === 'steering' && input.targetTurnId) {
    return { inputId: input.id, disposition: 'redirected', turnId: input.targetTurnId };
  }
  return {
    inputId: input.id,
    disposition: 'queued',
    ...(input.reason ? { reason: input.reason } : {}),
  };
}
