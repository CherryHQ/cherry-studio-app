import { ReasoningEffortOptionSchema } from '@cherrystudio/universal/types/aiSdk';
import { v7 as uuidv7 } from 'uuid';

import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import type {
  BackgroundReplyLifecycle,
  BackgroundReplyTurn,
} from '@/backend/services/backgroundReply';
import { traceErrorAttributes } from '@/backend/utils/diagnosticTrace';
import {
  AgentCancelSubmissionInputSchema,
  AgentCancelTurnInputSchema,
  AgentDeleteSessionInputSchema,
  AgentDeleteTurnInputSchema,
  AgentEventSchema,
  AgentForkSessionInputSchema,
  AgentInputPartSchema,
  AgentProtocolError,
  AgentRenameSessionInputSchema,
  AgentRespondApprovalInputSchema,
  AgentRespondQuestionSchema,
  AgentRetryMessageInputSchema,
  AgentSelectMessageInputSchema,
  AgentSessionSnapshotSchema,
  AgentStartSessionInputSchema,
  AgentSubmitMessageInputSchema,
  type AgentApprovalView,
  type AgentErrorView,
  type AgentEvent,
  type AgentInputPart,
  type AgentMessageView,
  type AgentPendingQuestion,
  type AgentProtocol,
  type AgentQueuedInput,
  type AgentSessionObservation,
  type AgentSessionStatus,
  type AgentSessionView,
  type AgentStartSessionInput,
  type AgentSubmitMessageInput,
  type AgentTurnView,
} from '@/shared/contracts/agent';
import { BackupError } from '@/shared/contracts/backup';
import type { SkillsModule } from '@/shared/contracts/skills';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { FileEntryIdSchema } from '@/shared/data/types/file';
import type { TraceContext } from '@/shared/data/types/trace';

import type { ManagedFileResolver } from '../resources/managedFileResolver';
import {
  LANES_PER_SESSION,
  laneKey,
  raceAbort,
  runtimeLane,
  sameLane,
  type AgentRuntime,
  type DurableAgentRuntime,
  type RuntimeLane,
  type RuntimeConversationEvent,
  type RuntimeConversationSeed,
  type RuntimeDurableTurn,
  type RuntimeExecutionIdentity,
  type RuntimeExecutionPorts,
  type RuntimeJsonValue,
  type RuntimeToolCall,
  type RuntimeToolRef,
  type RuntimeTool,
  type RuntimeTurnTiming,
} from '../runtime';
import type { AgentSessionStore, ReserveSubmissionResult } from '../sessionStore/AgentSessionStore';
import { settleInterruptedAssistantParts } from '../sessionStore/messageSettlement';
import type { MobileAgentHostNaming, MobileAgentHostPorts } from './agentHostTypes';
import { buildInitialSkillInstructions, buildAgentSystemPrompt } from './agentSystemPrompt';
import {
  durableRuntimeTiming,
  DurableTurnMetadataSchema,
  projectDurableHostTurn,
} from './durableHostProjection';
import { toAgentApprovalView } from './runtimeProjection';
import { toolResultDiagnostics } from './toolResultDiagnostics';
import { materializeRuntimeAttachments } from './turnAttachments';
import {
  prepareDurableTurn,
  prepareInitialTurn,
  prepareTurn,
  type TurnPlan,
  type TurnScope,
  type TurnPreparationDependencies,
} from './turnPreparation';
import {
  toRuntimeHistory,
  toRuntimeInputParts,
  type RuntimeAttachmentContents,
} from './turnRuntimeInput';
import { TurnUserQuestions } from './TurnUserQuestions';

const logger = loggerService.withContext('DurableAgentHost');
type Admission = { controller: AbortController; promise: Promise<unknown> };
/** Presentation state of one observed working copy. */
type LiveSession = {
  lane: RuntimeLane;
  waiters: Set<{ requestId: string; resolve: () => void }>;
  users: Set<string>;
  assistant: AgentMessageView | null;
  active: RuntimeDurableTurn | null;
  queue: readonly RuntimeDurableTurn[];
  contextStatus: 'compacting' | 'compaction-failed' | null;
  unsubscribe: () => Promise<void>;
  background: BackgroundReplyTurn | null;
  backgroundRequestId: string | null;
  /** Another answer of the question completed while this copy held the background reply. */
  backgroundCompleted: boolean;
  /** The running turn as last published for this copy. */
  turn: AgentTurnView | null;
  /** The newest answer this Host submitted to the copy: a hint, never the engine's tail. */
  lastAnswerId: string | null;
  question: AgentPendingQuestion | null;
  questions: TurnUserQuestions;
  approvals: Map<
    string,
    { view: AgentApprovalView; resolve: (decision: 'approve' | 'deny') => void }
  >;
};
type PreparedInput = { turnId: string; plan: TurnPlan };
/**
 * How one answer reaches a working copy: continue a lane whose newest answer is
 * the question's parent, natively fork the lane that executed that parent, or
 * rebuild a new lane from the Cherry history.
 */
type LaneChoice =
  | { lane: RuntimeLane; mode: 'native' | 'rebuild' }
  | {
      lane: RuntimeLane;
      mode: 'fork';
      from: { lane: RuntimeLane; boundary: string };
    };
/** The newest answer submitted to a copy, and when the copy was last used. */
type LaneTail = { answerId: string | undefined; usedAt: number };
type ReplyTarget = LaneChoice & {
  plan: TurnPlan;
  input: Pick<AgentSubmitMessageInput, 'assistantMessageId'>;
};

/** Runtime options use Pi's `off`; a resubmitted input uses the protocol's `none`. */
function submittedEffort(value: string | undefined) {
  const reasoningEffort = ReasoningEffortOptionSchema.safeParse(
    value === 'off' ? 'none' : value,
  ).data;
  return reasoningEffort ? { reasoningEffort } : {};
}

/** Business operations and disposable presentation over the persistent engine; no model loop. */
export class DurableAgentHost implements AgentProtocol {
  /** Keyed by {@link laneKey}. */
  private readonly live = new Map<string, LiveSession>();
  private readonly attachments = new Map<string, Promise<LiveSession>>();
  private readonly admissions = new Map<string, Admission>();
  private readonly prepared = new Map<string, PreparedInput>();
  /** Approval waits are app-observed; they join the turn's timing and its settled message. */
  private readonly approvalWaits = new Map<
    string,
    NonNullable<RuntimeTurnTiming['approvals']>[number][]
  >();
  private readonly preparing = new Map<string, Promise<PreparedInput>>();
  private readonly listeners = new Map<string, Set<(event: AgentEvent) => void>>();
  private readonly statuses = new Map<string, AgentSessionStatus>();
  private readonly statusListeners = new Map<string, Set<() => void>>();
  private readonly deleting = new Set<string>();
  private readonly pendingWrites = new Set<Promise<unknown>>();
  private readonly settlements = new Map<string, Promise<void>>();
  private readonly controller = new AbortController();
  private readonly naming: MobileAgentHostNaming;
  private accepting = false;
  private closing: Promise<void> | undefined;
  private suspension: Promise<void> | undefined;
  private resuming: Promise<void> | undefined;
  private suspended = false;
  private workWatch: { unsubscribe(): Promise<void> } | undefined;
  private executionLease: { release(): void } | undefined;

  private skillWorkflow: SkillsModule | undefined;

  configureSkills(workflow: SkillsModule): void {
    this.skillWorkflow = workflow;
  }

  get isReady() {
    return this.accepting;
  }
  hasPendingStorageWork() {
    return (
      !this.accepting ||
      this.admissions.size > 0 ||
      [...this.live.values()].some((state) => state.active || state.queue.length) ||
      this.pendingWrites.size > 0
    );
  }
  async quiesce() {
    if (
      !this.accepting ||
      this.admissions.size ||
      [...this.live.values()].some((state) => state.active || state.queue.length)
    )
      throw new BackupError('busy');
    await Promise.all([...this.settlements.values()]);
    await this.reconcileUnsettled();
    if (this.hasPendingStorageWork() || (await this.conversations.hasUnfinishedWork()))
      throw new BackupError('busy');
    await this.conversations.drainUsage();
    await this.captureCheckpoints();
    await this.naming.drain();
  }
  getWorkingStorageSize() {
    return Promise.resolve(this.ports.durableStorage?.size() ?? 0);
  }
  /**
   * Pi keeps retired and superseded copies until its file is removed. Cherry transcripts and
   * checkpoints stay authoritative, so each Session rebuilds a copy when it next continues.
   */
  async clearWorkingStorage() {
    await this.quiesce();
    // Suspension closes admission synchronously; input admitted during the drain stays busy.
    if (this.admissions.size) throw new BackupError('busy');
    this.suspension = this.suspend(new Error('Clearing the Agent working storage.')).then(() =>
      this.ports.durableStorage!.discard(),
    );
    try {
      await this.suspension;
    } finally {
      await this.resumeSuspended();
    }
  }
  pendingTurns(sessionId: string) {
    return this.liveStates(sessionId).flatMap((state) => state.queue);
  }

  constructor(
    private readonly store: AgentSessionStore,
    private readonly ports: MobileAgentHostPorts,
    private readonly background: BackgroundReplyLifecycle,
    private readonly runtime: AgentRuntime,
    readonly conversations: DurableAgentRuntime,
  ) {
    this.naming = ports.naming(this.controller.signal);
  }

  async initialize() {
    if (!this.ports.durableStorage || !this.ports.recordDurableUsage)
      throw new Error('Persistent Agent storage and usage ports are required.');
    const execution: RuntimeExecutionPorts = {
      scriptSandbox: this.ports.scriptSandbox?.(),
      writeToolOutput: this.ports.writeToolOutput
        ? async (identity, output, signal) => {
            const { plan } = await this.prepareExecution(identity, signal);
            return this.ports.writeToolOutput!(
              { ...output, folderId: plan.workspaceFolderId ?? null },
              signal,
            );
          }
        : undefined,
      onFailure: (error) => {
        logger.error('Durable Agent storage failed', new Error(error.message));
        for (const sessionId of this.listeners.keys())
          this.publish(sessionId, { type: 'runtime.failed' });
        void this.suspend(new Error(error.message)).catch((failure) =>
          logger.warn('Failed to suspend the Agent after storage failure', failure),
        );
      },
      traceModel: async (identity) => {
        const session = await this.store.getSession(identity.sessionId);
        const prepared = identity.requestId
          ? this.prepared.get(executionKey(identity, identity.requestId))
          : undefined;
        return this.ports.traces?.startTrace(
          'pi.generate_content',
          {
            agentId: prepared?.plan.agent.id ?? session?.agentId,
            sessionId: identity.sessionId,
            ...(identity.turnId ? { turnId: identity.turnId } : {}),
            ...(identity.requestId ? { requestId: identity.requestId } : {}),
          },
          { 'runtime.name': this.conversations.descriptor.id },
        );
      },
      assertExecutionAllowed: async (identity, signal) => {
        signal.throwIfAborted();
        storageMutationGate.assertWritable();
        if (this.deleting.has(identity.sessionId))
          fail('SESSION_NOT_FOUND', 'This session is being deleted.');
        const session = await this.store.getSession(identity.sessionId);
        if (!session || !(await this.isCurrentConversation(identity)))
          fail('SESSION_NOT_FOUND', 'The execution no longer has a current Cherry owner.');
        if (session && !(await this.ports.agents.getAgent(session.agentId)))
          fail('AGENT_NOT_FOUND', `Agent does not exist: ${session.agentId}`);
        if (identity.requestId) {
          await this.waitForOwner(identity, identity.requestId, signal);
          const prepared = this.prepared.get(executionKey(identity, identity.requestId));
          if (prepared)
            for (const id of await this.conversations.resourceFileEntryIds(identity))
              prepared.plan.resources.inheritFile(FileEntryIdSchema.parse(id));
        }
        signal.throwIfAborted();
      },
      resolveTool: (identity, ref, signal) => this.resolveTool(identity, ref, signal),
      requestApproval: (identity, approval, signal) =>
        this.requestApproval(identity, approval, signal),
      admitArtifacts: async (identity, artifacts, signal) => {
        const prepared = await this.prepareExecution(identity, signal);
        const ids = artifacts.map((artifact) => FileEntryIdSchema.parse(artifact.ref.fileEntryId));
        const available = await raceAbort(this.ports.files.resolveAvailable(ids), signal);
        for (const artifact of artifacts) {
          const fact = available.get(artifact.ref.fileEntryId);
          if (!fact || fact.mediaType !== artifact.mediaType || fact.name !== artifact.name)
            throw new Error('A tool artifact has no matching managed file.');
          prepared.plan.resources.grantFile(fact.fileEntryId);
        }
      },
      recordUsage: async (identity, report) => {
        const prepared = identity.requestId
          ? this.prepared.get(executionKey(identity, identity.requestId))
          : undefined;
        const session = await this.store.getSession(identity.sessionId);
        const agentId = prepared?.plan.agent.id ?? session?.agentId;
        // Deleted owners are never reconstructed from the disposable execution log.
        if (!agentId) return;
        const selected = identity.requestId
          ? (
              await this.conversations.history(identity, {
                limit: 1,
                requestIds: [identity.requestId],
              })
            ).turns[0]
          : undefined;
        await this.ports.recordDurableUsage!(identity, report, {
          agentId,
          agentName: prepared?.plan.agent.name ?? null,
          assistantMessageId: selected?.assistantMessageId ?? null,
        });
      },
    };
    const recovery = this.ports.traces?.startTrace('ai.recovery');
    try {
      this.controller.signal.throwIfAborted();
      await this.conversations.initialize(await this.ports.durableStorage.open(), execution);
      const copies = await this.conversations.sessions();
      // Upstream abort enables scheduling too. Attach current owners before retiring stale copies.
      // Every unfinished copy is observed from here on, so later reads need no engine-wide scan.
      const unfinished = await this.conversations.unfinishedLanes();
      recovery?.setAttributes({
        'agent.recovery.session_count': copies.length,
        'agent.recovery.unfinished_count': unfinished.length,
      });
      for (const lane of unfinished)
        if (await this.isCurrentConversation(lane)) await this.attach(lane);
      for (const { lane } of copies)
        if (!(await this.isCurrentConversation(lane)))
          await this.conversations.discardConversation(lane);
      // Working copies outlive the process: continuing a conversation reuses its native context.
      await this.reconcileUnsettled();
      await this.conversations.drainUsage();
      const work = await this.conversations.watchWork((active) => this.protectWork(active));
      this.workWatch = work;
      this.protectWork(work.active);
      this.controller.signal.throwIfAborted();
      this.accepting = true;
      this.conversations.resume();
      recovery?.end('ok');
    } catch (error) {
      recovery?.end('error', traceErrorAttributes(error));
      logger.error('Agent operation failed', { error, operation: 'ai.recovery' });
      if (!this.controller.signal.aborted)
        await this.suspend(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /** Ordinary generation disposal preserves upstream tasks; explicit stop uses abort(). */
  close(): Promise<void> {
    return (this.closing ??= this.closeGeneration());
  }

  private async closeGeneration() {
    this.accepting = false;
    this.controller.abort(new Error('The Agent Host generation is closing.'));
    for (const admission of this.admissions.values())
      admission.controller.abort(this.controller.signal.reason);
    await this.suspension?.catch((error) => logger.warn('Previous runtime cleanup failed', error));
    await this.resuming?.catch((error) => logger.warn('Runtime reopening failed', error));
    await this.workWatch?.unsubscribe();
    this.workWatch = undefined;
    await Promise.allSettled([...this.admissions.values()].map((admission) => admission.promise));
    await Promise.allSettled([...this.attachments.values()]);
    await Promise.allSettled([...this.live.values()].map((state) => state.unsubscribe()));
    await Promise.allSettled([...this.pendingWrites]);
    try {
      await this.conversations.close();
      await this.naming.drain();
    } finally {
      for (const state of this.live.values()) state.background?.retire();
      this.live.clear();
      this.prepared.clear();
      this.preparing.clear();
      this.listeners.clear();
      this.executionLease?.release();
      this.executionLease = undefined;
    }
  }

  private protectWork(active: boolean) {
    if (active && !this.executionLease && !this.controller.signal.aborted)
      this.executionLease = this.ports.executionLease?.(() => this.suspend());
    if (!active) {
      this.executionLease?.release();
      this.executionLease = undefined;
    }
  }

  /** OS expiration closes invocations without abort marks; foreground reopens persisted tasks. */
  private suspend(reason = new Error('Background execution expired.')): Promise<void> {
    if (this.controller.signal.aborted) return this.closing ?? Promise.resolve();
    return (this.suspension ??= this.traceOperation('ai.suspend', {}, async () => {
      this.accepting = false;
      this.suspended = true;
      for (const admission of this.admissions.values()) admission.controller.abort(reason);
      await Promise.allSettled([...this.admissions.values()].map((entry) => entry.promise));
      await this.workWatch?.unsubscribe();
      this.workWatch = undefined;
      await Promise.allSettled([...this.attachments.values()]);
      await Promise.allSettled([...this.live.values()].map((state) => state.unsubscribe()));
      await Promise.allSettled([...this.pendingWrites]);
      try {
        await this.conversations.close();
      } finally {
        for (const state of this.live.values()) state.background?.retire();
        this.live.clear();
        this.prepared.clear();
        this.preparing.clear();
        this.executionLease?.release();
        this.executionLease = undefined;
      }
    }));
  }

  async resumeSuspended() {
    if (this.resuming) return this.resuming;
    if (!this.suspended || this.controller.signal.aborted) return;
    this.resuming = (async () => {
      await this.suspension?.catch((error) =>
        logger.warn('Previous runtime cleanup failed', error),
      );
      if (this.controller.signal.aborted) return;
      this.suspended = false;
      this.suspension = undefined;
      try {
        await this.initialize();
      } catch (error) {
        this.suspended = true;
        throw error;
      }
    })().finally(() => {
      this.resuming = undefined;
    });
    return this.resuming;
  }

  getSessionStatus(sessionId: string) {
    return this.statuses.get(sessionId) ?? null;
  }
  subscribeSessionStatus(sessionId: string, listener: () => void) {
    const listeners = this.statusListeners.get(sessionId) ?? new Set();
    this.statusListeners.set(sessionId, listeners);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.statusListeners.delete(sessionId);
    };
  }

  startSession(input: AgentStartSessionInput) {
    const parsed = AgentStartSessionInputSchema.parse(input);
    return this.admit(parsed.sessionId, async (signal) => {
      if (await this.store.getSession(parsed.sessionId))
        fail('SESSION_BUSY', 'This session already exists.');
      const answers = replyTargets(parsed);
      const targets = await eachAnswer(
        answers,
        signal,
        async (answer, index, signal): Promise<ReplyTarget> => {
          const input = { ...parsed, ...answer };
          return {
            lane: runtimeLane(parsed.sessionId, index),
            mode: 'rebuild',
            plan: await prepareInitialTurn(this.preparation, input, signal, {
              readOnlyTools: answers.length > 1,
            }),
            input,
          };
        },
      );
      await this.submitTargets(parsed, null, targets, signal, {
        agentId: parsed.agentId,
        workspaceFolderId: parsed.workspaceFolderId,
      });
      return this.requireSession(parsed.sessionId);
    });
  }

  submitMessage(input: AgentSubmitMessageInput) {
    return this.submitNative(AgentSubmitMessageInputSchema.parse(input));
  }

  private submitNative(parsed: AgentSubmitMessageInput) {
    return this.admit(parsed.sessionId, async (signal) => {
      const session = await this.requireSession(parsed.sessionId);
      const current = await this.syncSession(parsed.sessionId);
      const parent = session.activeNodeId ?? null;
      const answers = replyTargets(parsed);
      const busy = this.busyLanes(parsed.sessionId);
      if (busy.length && answers.length > 1)
        fail('SESSION_BUSY', 'Wait for the current answers before asking several models.');
      const choices = await this.chooseLanes(parsed.sessionId, parent, answers.length, current);
      // Only a follow-up to the busy lane's newest answer can wait in its queue.
      const [first] = choices;
      if (
        busy.length &&
        (first.mode !== 'native' || busy.length > 1 || !sameLane(busy[0], first.lane))
      )
        fail('SESSION_BUSY', 'Wait for the current answer before continuing another branch.');
      const scope = { through: parent, readOnlyTools: answers.length > 1 };
      const targets = await eachAnswer(
        answers,
        signal,
        async (answer, index, signal): Promise<ReplyTarget> => {
          const input = { ...parsed, ...answer };
          const choice = choices[index]!;
          return { ...choice, plan: await this.planAnswer(choice, input, signal, scope), input };
        },
      );
      return this.submitTargets(parsed, parent, targets, signal);
    });
  }

  /** Rebuilt copies read their history from Cherry; native and forked ones keep the engine's. */
  private async planAnswer(
    choice: LaneChoice,
    input: AgentSubmitMessageInput,
    signal: AbortSignal,
    scope: TurnScope,
  ) {
    return choice.mode === 'rebuild'
      ? prepareTurn(this.preparation, input, signal, undefined, scope)
      : prepareDurableTurn(
          this.preparation,
          input,
          await this.conversations.resourceFileEntryIds(
            choice.mode === 'fork' ? choice.from.lane : choice.lane,
          ),
          signal,
          scope,
        );
  }

  /**
   * Picks a working copy for each of `count` answers below `parent`. The first
   * answer continues the copy whose newest answer is `parent`; the others
   * natively fork the copy that executed `parent`, or rebuild from Cherry
   * history when no current copy holds it. New copies take a free slot, else
   * replace the least recently used idle copy: every copy is rebuildable.
   * Engine tails are read only as far as the choice needs them.
   */
  private async chooseLanes(
    sessionId: string,
    parent: string | null,
    count: number,
    current: readonly RuntimeLane[],
  ): Promise<LaneChoice[]> {
    const tails = new Map<string, LaneTail>();
    const tail = async (lane: RuntimeLane) => {
      const key = laneKey(lane);
      const known = tails.get(key);
      if (known) return known;
      const read = await this.laneTail(lane);
      tails.set(key, read);
      return read;
    };
    // The copy this Host last gave `parent` is checked first; the engine's tail decides.
    const hinted = (lane: RuntimeLane) =>
      Number(this.live.get(laneKey(lane))?.lastAnswerId === parent);
    const ordered = [...current].sort((a, b) => hinted(b) - hinted(a));
    let native: RuntimeLane | undefined;
    if (parent)
      for (const lane of ordered)
        if ((await tail(lane)).answerId === parent) {
          native = lane;
          break;
        }
    const choices: LaneChoice[] = native ? [{ lane: native, mode: 'native' }] : [];
    const source =
      parent && choices.length < count
        ? await this.answerBoundary(
            native ? [native, ...ordered.filter((lane) => lane !== native)] : ordered,
            parent,
          )
        : undefined;
    // Free slots first, then idle copies from the least recently used; the copy continued or
    // forked from stays.
    const bound = new Set(current.map(laneKey));
    const free = Array.from({ length: LANES_PER_SESSION }, (_, slot) =>
      runtimeLane(sessionId, slot),
    ).filter((lane) => !bound.has(laneKey(lane)));
    const needed = count - choices.length;
    const reusable: { lane: RuntimeLane; usedAt: number }[] = [];
    if (free.length < needed)
      for (const lane of current)
        if (lane !== native && lane !== source?.lane && !this.isBusy(lane))
          reusable.push({ lane, usedAt: (await tail(lane)).usedAt });
    reusable.sort((a, b) => a.usedAt - b.usedAt);
    for (const lane of [...free, ...reusable.map((entry) => entry.lane)].slice(0, needed))
      choices.push(source ? { lane, mode: 'fork', from: source } : { lane, mode: 'rebuild' });
    if (choices.length < count) fail('SESSION_BUSY', 'Every working copy of this session is busy.');
    return choices;
  }

  /** The current copy that executed a settled answer, and that answer's history boundary. */
  private async answerBoundary(current: readonly RuntimeLane[], answerId: string) {
    for (const lane of current) {
      const turn = (await this.conversations.message(lane, answerId))?.turn;
      if (turn?.assistantMessageId === answerId && turn.answerBoundary)
        return { lane, boundary: turn.answerBoundary };
    }
    return undefined;
  }

  private async laneTail(lane: RuntimeLane): Promise<LaneTail> {
    const state = this.live.get(laneKey(lane));
    const pending = state?.queue.at(-1) ?? state?.active;
    if (pending) return { answerId: pending.assistantMessageId, usedAt: Date.now() };
    const latest = (await this.conversations.history(lane, { limit: 1 })).turns[0];
    return { answerId: latest?.assistantMessageId, usedAt: latest?.updatedAt ?? 0 };
  }

  private isBusy(lane: RuntimeLane) {
    const state = this.live.get(laneKey(lane));
    return Boolean(state?.active || state?.queue.length);
  }

  private liveStates(sessionId: string) {
    return [...this.live.values()].filter((state) => state.lane.sessionId === sessionId);
  }

  /** Copies of a Session with an active or queued input. */
  private busyLanes(sessionId: string) {
    return this.liveStates(sessionId)
      .filter((state) => state.active || state.queue.length)
      .map((state) => state.lane);
  }

  /** Every bound or observed copy of a Session. */
  private async sessionLanes(sessionId: string) {
    const lanes = [
      ...(await this.conversations.lanes(sessionId)).map(({ lane }) => lane),
      ...this.liveStates(sessionId).map((state) => state.lane),
    ];
    return [...new Map(lanes.map((lane) => [laneKey(lane), lane])).values()];
  }

  /**
   * Prepares each answer's working copy, reserves the question and every answer
   * in one Cherry transaction, then admits each answer to its own lane.
   */
  private async submitTargets(
    input: AgentSubmitMessageInput | AgentStartSessionInput,
    parent: string | null,
    targets: readonly ReplyTarget[],
    signal: AbortSignal,
    initial?: { agentId: string; workspaceFolderId?: string },
    /** Replaces the new-question reservation: a sibling answer or an in-place retry. */
    reserve?: () => Promise<ReserveSubmissionResult>,
  ) {
    const { sessionId } = input;
    for (const { plan } of targets)
      if (!plan.imageGeneration && !plan.modelPreflight)
        throw new Error('A text input requires model preflight.');
    const files = sharedImageReads(this.ports.files);
    const attachments = await eachAnswer(
      targets,
      signal,
      async ({ plan }, _index, signal): Promise<RuntimeAttachmentContents> =>
        plan.imageGeneration
          ? new Map()
          : materializeRuntimeAttachments({
              files,
              history: plan.history,
              inputParts: plan.inputParts,
              modelPreflight: plan.modelPreflight!,
              resources: plan.resources,
              signal,
              contentAttachments: plan.runtimeContentAttachments,
            }),
    );
    await this.prepareLanes(sessionId, targets, attachments, signal);
    signal.throwIfAborted();
    const [primary, ...others] = targets;
    const reservation = {
      sessionId,
      userMessageId: input.userMessageId,
      assistantMessageId: primary.input.assistantMessageId,
      userParts: primary.plan.userParts,
      modelId: primary.plan.inferenceSnapshot.model.uniqueModelId,
      inferenceSnapshot: primary.plan.inferenceSnapshot,
      ...(others.length
        ? {
            additionalReplies: others.map(({ input: answer, plan }) => ({
              assistantMessageId: answer.assistantMessageId,
              modelId: plan.inferenceSnapshot.model.uniqueModelId,
              inferenceSnapshot: plan.inferenceSnapshot,
            })),
          }
        : {}),
    };
    const reserved = reserve
      ? await reserve()
      : initial
        ? await this.store.reserveInitialSubmission({
            ...reservation,
            agentId: initial.agentId,
            ...(initial.workspaceFolderId ? { workspaceFolderId: initial.workspaceFolderId } : {}),
          })
        : await this.store.reserveSubmission({ ...reservation, parentMessageId: parent });
    const { turnId } = reserved;
    const assistants = [reserved.assistantMessage, ...reserved.additionalAssistantMessages];
    // The reservation selected the new answer. Observers learn the branch before its rows arrive.
    const selected = await this.store.getSession(sessionId);
    if (selected) this.publish(sessionId, { type: 'session.updated', session: selected });
    // Cherry owns the identities before the engine can execute. Recovery reconciles each answer.
    try {
      for (const [index, target] of targets.entries()) {
        const { plan } = target;
        const assistant = assistants[index];
        if (!assistant) throw new Error('A reserved answer is missing.');
        // Each answer is its own engine request; a question's answers share its turn id.
        const requestId = assistant.id;
        const state = await this.attach(target.lane);
        signal.throwIfAborted();
        plan.usageAttribution.bindMessage({ id: assistant.id, kind: 'agent-session' });
        this.prepared.set(executionKey(target.lane, requestId), { turnId, plan });
        await this.conversations.submit(target.lane, {
          requestId,
          turnId,
          userMessageId: input.userMessageId,
          assistantMessageId: assistant.id,
          createdAt: Date.parse(assistant.updatedAt),
          input: plan.imageGeneration
            ? plan.inputParts.map((part) => ({
                type: 'text' as const,
                text:
                  part.type === 'text'
                    ? part.text
                    : `[Image input: ${part.filename ?? part.fileEntryId}]`,
              }))
            : toRuntimeInputParts(plan.inputParts, plan.resources, attachments[index]!),
          ...(plan.retry?.resumeParts.length
            ? {
                resume: toRuntimeHistory([{ ...assistant, parts: plan.retry.resumeParts }]).flatMap(
                  (turn) => turn.messages.flatMap((message) => message.parts),
                ),
              }
            : {}),
          metadata: {
            ...(plan.retry?.resumeParts.length
              ? { retainedParts: assistant.parts as unknown as RuntimeJsonValue[] }
              : {}),
            // Schema-validated parts are plain JSON; their interface types lack index signatures.
            userParts: plan.userParts as unknown as RuntimeJsonValue[],
            inferenceSnapshot: plan.inferenceSnapshot,
            workspaceFolderId: plan.workspaceFolderId ?? null,
            referencedFileEntryIds: [...plan.resources.inputFiles.keys()],
            hasHistoryBeforeActiveTurn: plan.hasMessages,
            parentMessageId: reserved.userMessage.parentId ?? null,
            ...(targets.length > 1 ? { readOnlyTools: true } : {}),
          },
        });
        state.lastAnswerId = assistant.id;
      }
    } catch (error) {
      // Admission can fail after its native commit. Re-read before marking a reservation interrupted.
      await this.reconcileUnsettled(sessionId);
      throw error;
    }
    if (!primary.plan.hasMessages)
      this.renameFrom(
        this.naming.maybeRenameFromFirstUserMessage(sessionId, primary.plan.inputParts),
      );
    return {
      turnId,
      userMessageId: input.userMessageId,
      assistantMessageId: reserved.assistantMessage.id,
    };
  }

  /**
   * Prepares every answer's working copy together. Answers that must rebuild from
   * Cherry history share one rebuild: the copy of the model that keeps the most of
   * that history (images, then context size) is rebuilt and the others fork it, as
   * they fork a copy that ran the question's parent. Pi adapts the forked history
   * to each model.
   */
  private async prepareLanes(
    sessionId: string,
    targets: readonly ReplyTarget[],
    attachments: readonly RuntimeAttachmentContents[],
    signal: AbortSignal,
  ) {
    // A new copy may take over the slot of a least recently used one. Retiring a copy drains
    // its usage, so it stays serial.
    for (const target of targets)
      if (target.mode !== 'native' && (await this.conversations.hasConversation(target.lane)))
        await this.detachLane(target.lane);
    const rebuilds = targets.filter((target) => target.mode === 'rebuild');
    const source =
      rebuilds.length > 1
        ? rebuilds.reduce((best, target) => (keepsMoreHistory(target, best) ? target : best))
        : undefined;
    const boundary =
      source &&
      (await this.prepareLane(sessionId, source, attachments[targets.indexOf(source)]!, signal));
    await eachAnswer(targets, signal, async (target, index, signal) => {
      if (target === source) return;
      await this.prepareLane(
        sessionId,
        source && boundary && target.mode === 'rebuild'
          ? { ...target, mode: 'fork', from: { lane: source.lane, boundary } }
          : target,
        attachments[index]!,
        signal,
      );
    });
  }

  /**
   * Creates, forks or reconfigures the answer's working copy before anything is reserved.
   * A rebuild returns its history boundary.
   */
  private async prepareLane(
    sessionId: string,
    target: ReplyTarget,
    attachments: RuntimeAttachmentContents,
    signal: AbortSignal,
  ): Promise<string | undefined> {
    const { plan } = target;
    const configuration = this.configuration(plan);
    const revision = (await this.store.getRuntimeRevision(sessionId)) ?? 0;
    if (target.mode === 'rebuild') {
      return this.conversations.ensureConversation(
        {
          lane: target.lane,
          revision,
          configuration,
          ...(plan.history.length > 0 || plan.runtimeContextCheckpoint
            ? {
                history: {
                  history: toRuntimeHistory(
                    plan.history,
                    attachments,
                    plan.inferenceSnapshot.model.uniqueModelId,
                  ),
                  contextCheckpoint: plan.runtimeContextCheckpoint,
                  referencedFileEntryIds: [...plan.resources.fileEntryIds],
                },
              }
            : {}),
        },
        signal,
      );
    } else if (target.mode === 'fork') {
      await this.conversations.forkConversation(
        { lane: target.lane, revision, configuration, from: target.from },
        signal,
      );
    } else {
      if (this.isBusy(target.lane)) {
        const current = await this.conversations.configuration(target.lane);
        if (configurationKey(current) !== configurationKey(configuration))
          fail('SESSION_BUSY', 'Wait for the current turn before changing its configuration.');
      } else await this.conversations.configure(target.lane, configuration);
    }
  }

  private configuration(plan: TurnPlan): RuntimeConversationSeed['configuration'] {
    return {
      kind: plan.imageGeneration ? 'image' : 'language',
      model: plan.agent.model,
      options: plan.agent.options,
      tools: plan.imageGeneration ? [this.imageTool(plan)] : plan.tools,
      ...(plan.webTools && !plan.imageGeneration ? { webTools: plan.webTools } : {}),
      initialInstructions:
        plan.agent.mode === 'standard'
          ? [...buildInitialSkillInstructions(plan.skills), ...plan.workflowInstructions]
          : [],
      instructions: buildAgentSystemPrompt({
        agentInstructions: plan.agent.instructions,
        mode: plan.agent.mode,
        appLanguage: this.ports.appLanguage(),
        tools: plan.tools,
        pluginGuides: plan.pluginGuides,
        skills: plan.skills,
        toolDiscoveryWarnings: plan.toolDiscoveryWarnings,
      }),
    };
  }

  async forkSession(input: Parameters<AgentProtocol['forkSession']>[0]) {
    const parsed = AgentForkSessionInputSchema.parse(input);
    this.assertIdle(parsed.sessionId);
    return this.admit(parsed.sessionId, async () => {
      await this.syncSession(parsed.sessionId, true);
      return this.copySession(parsed);
    });
  }

  private async copySession(input: Parameters<AgentProtocol['forkSession']>[0]) {
    const result = await this.store.forkSession(input);
    if (result.status === 'session-not-found')
      fail('SESSION_NOT_FOUND', 'The source session no longer exists.');
    if (result.status === 'message-not-found')
      fail('MESSAGE_NOT_FOUND', 'The fork point no longer exists.');
    if (result.status === 'fork-point-unsettled')
      fail('SESSION_BUSY', 'The fork point is still running.');
    return result.session;
  }

  async retryMessage(
    input: Parameters<AgentProtocol['retryMessage']>[0],
  ): Promise<AgentSessionView | void> {
    const parsed = AgentRetryMessageInputSchema.parse(input);
    this.assertIdle(parsed.sessionId);
    return this.admit(parsed.sessionId, async (signal) => {
      const current = await this.syncSession(parsed.sessionId, true);
      const source = await this.requireSession(parsed.sessionId);
      const assistant = await this.store.getMessage(source.id, parsed.messageId);
      const user = assistant?.parentId
        ? await this.store.getMessage(source.id, assistant.parentId)
        : null;
      if (
        !assistant ||
        assistant.role !== 'assistant' ||
        user?.role !== 'user' ||
        user.turnId !== assistant.turnId
      )
        fail('MESSAGE_NOT_FOUND', 'The original question is unavailable.');
      if (assistant.status === 'pending' || assistant.status === 'streaming')
        fail('SESSION_BUSY', 'The answer has not settled.');
      const snapshot =
        assistant.inferenceSnapshot?.status === 'supported'
          ? assistant.inferenceSnapshot.snapshot
          : undefined;
      // Another model keeps only the question: effort and image settings belong to the original.
      const switched = parsed.modelId !== undefined && parsed.modelId !== assistant.modelId;
      const modelId = parsed.modelId ?? assistant.modelId;
      const choices = {
        parts: userInput(user.parts),
        ...submittedSkills(user.parts),
        ...(modelId ? { modelId } : {}),
        ...(switched ? {} : submittedEffort(snapshot?.reasoningEffort)),
        ...(!switched && snapshot?.imageGeneration
          ? { imageGeneration: snapshot.imageGeneration }
          : {}),
      };
      const parent = user.parentId ?? null;
      // A successful or continued answer stays, and answering with a chosen model always adds
      // one: these add a sibling answer and select it.
      if (
        parsed.modelId !== undefined ||
        assistant.status === 'success' ||
        (await this.store.hasChildren(source.id, assistant.id))
      ) {
        const answer = { assistantMessageId: uuidv7() };
        const regenerate = {
          ...choices,
          sessionId: source.id,
          userMessageId: user.id,
          ...answer,
        };
        const [choice] = await this.chooseLanes(source.id, parent, 1, current);
        const plan = await this.planAnswer(choice, regenerate, signal, { through: parent });
        await this.submitTargets(
          regenerate,
          parent,
          [{ ...choice, plan, input: answer }],
          signal,
          undefined,
          () =>
            this.store.reserveAnswer({
              sessionId: source.id,
              userMessageId: user.id,
              assistantMessageId: answer.assistantMessageId,
              modelId: plan.inferenceSnapshot.model.uniqueModelId,
              inferenceSnapshot: plan.inferenceSnapshot,
            }),
        );
        return;
      }
      // Failed latest answers keep their message identities. Rebuild before retrying so the old
      // execution can never write into the replacement reservation.
      const retry = {
        ...choices,
        sessionId: source.id,
        userMessageId: user.id,
        assistantMessageId: assistant.id,
      };
      const plan = await prepareTurn(this.preparation, retry, signal, assistant.id, {
        through: parent,
      });
      const lastTool = assistant.parts.findLastIndex(
        (part) =>
          part.type === 'dynamic-tool' && part.input !== undefined && part.output !== undefined,
      );
      const retained =
        lastTool < 0
          ? []
          : assistant.parts
              .slice(0, lastTool + 1)
              .filter(
                (part) =>
                  part.type !== 'data-error' &&
                  (part.type !== 'dynamic-tool' ||
                    (part.input !== undefined && part.output !== undefined)),
              );
      if (retained.length) {
        plan.history.push(user, { ...assistant, parts: retained });
        plan.retry = { resumeParts: retained };
      }
      const reserved = await this.store.reserveRetry({
        ...retry,
        userParts: plan.userParts,
        assistantParts: retained,
        modelId: plan.inferenceSnapshot.model.uniqueModelId,
        inferenceSnapshot: plan.inferenceSnapshot,
      });
      try {
        // The same Cherry transaction invalidated every lane of this Session.
        await this.detachConversation(source.id);
        await this.submitTargets(
          retry,
          parent,
          [{ lane: runtimeLane(source.id), mode: 'rebuild', plan, input: retry }],
          signal,
          undefined,
          async () => reserved,
        );
      } catch (error) {
        await this.reconcileUnsettled(source.id);
        throw error;
      }
    });
  }

  async selectMessage(input: Parameters<AgentProtocol['selectMessage']>[0]) {
    const parsed = AgentSelectMessageInputSchema.parse(input);
    storageMutationGate.assertWritable();
    await this.requireSession(parsed.sessionId);
    const session = await this.store.selectMessage(parsed.sessionId, parsed.messageId);
    if (!session) fail('MESSAGE_NOT_FOUND', 'The message no longer exists.');
    this.publish(session.id, { type: 'session.updated', session });
    this.ports.durableStorage?.notifyTranscript(session.id);
    return session;
  }

  async deleteTurn(input: Parameters<AgentProtocol['deleteTurn']>[0]) {
    const parsed = AgentDeleteTurnInputSchema.parse(input);
    this.assertIdle(parsed.sessionId);
    return this.admit(parsed.sessionId, async () => {
      await this.syncSession(parsed.sessionId, true);
      const result = await this.store.deleteTurn(parsed);
      if (result.status === 'session-not-found')
        fail('SESSION_NOT_FOUND', 'The session no longer exists.');
      if (result.status === 'turn-not-found')
        fail('MESSAGE_NOT_FOUND', 'The turn no longer exists.');
      if (result.status === 'turn-unsettled') fail('SESSION_BUSY', 'The turn has not settled.');
      // The same Cherry transaction invalidated the old revision. A crash before retirement is safe.
      await this.detachConversation(parsed.sessionId).catch((error: unknown) =>
        logger.warn('Deferred obsolete working-copy cleanup', error as Error),
      );
      if (this.getSessionStatus(parsed.sessionId)?.turnId === parsed.turnId)
        this.setStatus(parsed.sessionId, null);
      this.publish(parsed.sessionId, {
        type: 'turn.deleted',
        turnId: parsed.turnId,
        messageIds: result.deletedMessageIds,
      });
      // Deleting the selected branch moves the Session's active node.
      const session = await this.store.getSession(parsed.sessionId);
      if (session) this.publish(parsed.sessionId, { type: 'session.updated', session });
      this.ports.durableStorage?.notifyTranscript(parsed.sessionId);
    });
  }

  async renameSession(input: Parameters<AgentProtocol['renameSession']>[0]) {
    const parsed = AgentRenameSessionInputSchema.parse(input);
    storageMutationGate.assertWritable();
    await this.requireSession(parsed.sessionId);
    const session = await this.store.renameSession(parsed.sessionId, parsed.name);
    if (!session) fail('SESSION_NOT_FOUND', 'The session no longer exists.');
    this.publish(session.id, { type: 'session.updated', session });
    this.background.updateSessionTitle(session.id, session.name);
    return session;
  }

  async deleteSession(input: Parameters<AgentProtocol['deleteSession']>[0]) {
    const { sessionId } = AgentDeleteSessionInputSchema.parse(input);
    storageMutationGate.assertWritable();
    if (!this.accepting) fail('EXECUTION_UNAVAILABLE', 'The Agent Host is not ready.');
    if (this.deleting.has(sessionId)) fail('SESSION_BUSY', 'This session is being deleted.');
    this.deleting.add(sessionId);
    try {
      const admission = this.admissions.get(sessionId);
      admission?.controller.abort(new Error('The session is being deleted.'));
      await admission?.promise.catch(() => undefined);
      const lanes = await this.sessionLanes(sessionId);
      for (const lane of lanes)
        if (await this.conversations.hasConversation(lane)) await this.conversations.abort(lane);
      for (const lane of lanes) await this.live.get(laneKey(lane))?.unsubscribe();
      await this.settlements.get(sessionId);
      await this.conversations.drainUsage();
      if (!(await this.store.deleteSession(sessionId)))
        fail('SESSION_NOT_FOUND', 'The session no longer exists.');
      // Missing Cherry ownership is a durable invalidation: no startup path recreates this session.
      await this.detachConversation(sessionId).catch((error: unknown) =>
        logger.warn('Deferred deleted working-copy cleanup', error as Error),
      );
      this.background.clearSession(sessionId);
      this.listeners.delete(sessionId);
      this.setStatus(sessionId, null);
      this.ports.durableStorage?.notifyTranscript(sessionId);
    } finally {
      this.deleting.delete(sessionId);
    }
  }

  /** Retires every working copy of a Session; Cherry history stays the source of truth. */
  private async detachConversation(sessionId: string) {
    for (const lane of await this.sessionLanes(sessionId)) await this.detachLane(lane);
  }

  private async detachLane(lane: RuntimeLane) {
    const state = this.live.get(laneKey(lane));
    await state?.unsubscribe();
    state?.background?.retire();
    this.live.delete(laneKey(lane));
    if (await this.conversations.hasConversation(lane))
      await this.conversations.discardConversation(lane);
  }

  /**
   * Observed copies of a Session. Every copy with native work is observed: recovery attaches
   * unfinished copies and admission attaches each copy it submits to. The first copy is also
   * observed while current, as before branching.
   */
  private async attachedLanes(sessionId: string) {
    const first = runtimeLane(sessionId);
    if (!this.live.has(laneKey(first)) && (await this.isCurrentConversation(first)))
      await this.attach(first);
    return this.liveStates(sessionId);
  }

  async cancelTurn(input: Parameters<AgentProtocol['cancelTurn']>[0]) {
    const parsed = AgentCancelTurnInputSchema.parse(input);
    for (const state of await this.attachedLanes(parsed.sessionId)) {
      if (state.active?.identity.turnId !== parsed.turnId) {
        if (parsed.messageId) continue;
        const queued = state.queue.find((turn) => turn.identity.turnId === parsed.turnId);
        if (queued) await this.conversations.withdraw(state.lane, queued.identity.requestId);
        continue;
      }
      // A multi-model answer can be stopped alone; without a message the whole question stops.
      if (parsed.messageId && state.active.assistantMessageId !== parsed.messageId) continue;
      this.publish(parsed.sessionId, {
        type: 'turn.updated',
        turn: { ...projectDurableHostTurn(state.active).turn, status: 'cancelling' },
      });
      await this.conversations.abort(state.lane);
    }
  }

  async cancelQueuedInput(
    input: Parameters<AgentProtocol['cancelQueuedInput']>[0],
  ): ReturnType<AgentProtocol['cancelQueuedInput']> {
    const { sessionId, turnId } = AgentCancelTurnInputSchema.parse(input);
    storageMutationGate.assertWritable();
    const states = await this.attachedLanes(sessionId);
    const owner = states.find((state) =>
      state.queue.some((turn) => turn.identity.turnId === turnId),
    );
    if (!owner)
      return states.some((state) => state.active?.identity.turnId === turnId)
        ? 'already-started'
        : 'not-found';
    const queued = owner.queue.find((turn) => turn.identity.turnId === turnId)!;
    const result = await this.conversations.withdraw(owner.lane, queued.identity.requestId);
    // The Runtime checks placement and withdrawal in one transaction. Never turn a lost race
    // into abort(sessionId), which would stop the active input and every remaining follow-up.
    if (result === 'already-placed') return 'already-started';
    // Another admission may have reserved its rows without reaching Pi yet. Only reconcile the
    // input whose withdrawal was confirmed; a session-wide recovery would interrupt that receipt.
    if (result === 'aborted') await this.persistTurn({ ...queued, status: 'cancelled' });
    return result === 'aborted' ? 'withdrawn' : 'not-found';
  }

  async cancelSubmission(input: Parameters<AgentProtocol['cancelSubmission']>[0]) {
    const { sessionId } = AgentCancelSubmissionInputSchema.parse(input);
    this.admissions.get(sessionId)?.controller.abort(
      new AgentProtocolError({
        code: 'CANCELLED',
        message: 'The submission was cancelled.',
        retryable: true,
      }),
    );
  }

  async respondApproval(input: Parameters<AgentProtocol['respondApproval']>[0]) {
    const parsed = AgentRespondApprovalInputSchema.parse(input);
    const state = this.liveStates(parsed.sessionId).find(
      (candidate) =>
        candidate.active?.identity.turnId === parsed.turnId &&
        candidate.approvals.get(parsed.approvalId)?.view.status === 'pending',
    );
    const pending = state?.approvals.get(parsed.approvalId);
    if (!pending) fail('APPROVAL_NOT_FOUND', 'The approval is no longer pending.');
    pending.resolve(parsed.decision);
  }

  async respondQuestion(input: Parameters<AgentProtocol['respondQuestion']>[0]) {
    const parsed = AgentRespondQuestionSchema.parse(input);
    const state = this.liveStates(parsed.sessionId).find(
      (candidate) =>
        candidate.active?.identity.turnId === parsed.turnId &&
        candidate.question?.toolCallId === parsed.toolCallId,
    );
    if (!state) fail('QUESTION_NOT_FOUND', 'The question is no longer pending.');
    state.questions.respond(parsed.toolCallId, parsed.answer);
  }

  async observeSession(
    sessionId: string,
    listener: (event: AgentEvent) => void,
  ): Promise<AgentSessionObservation> {
    await this.resumeSuspended();
    const session = await this.requireSession(sessionId);
    const agent = await this.ports.agents.getAgent(session.agentId);
    if (!agent) fail('AGENT_NOT_FOUND', 'The agent no longer exists.');
    const states = this.accepting ? await this.attachedLanes(sessionId) : [];
    await this.requireSession(sessionId);
    // Several lanes run when one question has several answers; the first active one leads.
    const running = states.filter((state) => state.active);
    const state = running[0] ?? states[0];
    const view = state?.active ? projectDurableHostTurn(state.active) : undefined;
    const snapshot = AgentSessionSnapshotSchema.parse({
      agent: { id: agent.id, name: agent.name },
      session,
      capabilities: this.conversations.descriptor.capabilities,
      activeTurn: view ? this.turnStatus(view.turn, state!) : null,
      queuedInputs: this.queuedInputs(states.flatMap((candidate) => candidate.queue)),
      activeUserMessage: view?.user ?? null,
      streamingMessage: view?.assistant ?? null,
      additionalStreamingMessages: running
        .slice(1)
        .flatMap((candidate) => projectDurableHostTurn(candidate.active!).assistant ?? []),
      hasHistoryBeforeActiveTurn: state?.active
        ? DurableTurnMetadataSchema.parse(state.active.metadata).hasHistoryBeforeActiveTurn
        : null,
      pendingQuestion: states.find((candidate) => candidate.question)?.question ?? null,
      contextStatus: state?.contextStatus ?? null,
      pendingApprovals: states.flatMap((candidate) =>
        [...candidate.approvals.values()].map((entry) => entry.view),
      ),
    });
    const listeners = this.listeners.get(sessionId) ?? new Set();
    this.listeners.set(sessionId, listeners);
    listeners.add(listener);
    return {
      snapshot,
      unsubscribe: () => {
        listeners.delete(listener);
        if (!listeners.size) this.listeners.delete(sessionId);
      },
    };
  }

  private get preparation(): TurnPreparationDependencies {
    return {
      agents: this.ports.agents,
      askUser: (question, call) => this.askUser(question, call),
      appLanguage: () => this.ports.appLanguage(),
      documentParserMode: () => this.ports.documentParserMode(),
      files: this.ports.files,
      inferenceModel: this.ports.inferenceModel,
      imageGeneration: this.ports.imageGeneration,
      runtime: this.runtime,
      runtimeTools: this.ports.runtimeTools,
      store: this.store,
      systemCapabilities: this.ports.tools,
      webTools: this.ports.webTools ? () => this.ports.webTools!() : undefined,
      ...(this.ports.skills ? { skills: this.ports.skills } : {}),
      ...(this.skillWorkflow ? { skillWorkflow: this.skillWorkflow } : {}),
    };
  }

  private async prepareExecution(
    identity: RuntimeExecutionIdentity,
    signal: AbortSignal,
  ): Promise<PreparedInput> {
    const key = executionKey(identity, identity.requestId);
    const cached = this.prepared.get(key);
    if (cached) return cached;
    const existing = this.preparing.get(key);
    if (existing) return raceAbort(existing, signal);
    const operation = this.traceOperation(
      'ai.prepare',
      identity,
      async () => {
        const state = await this.attach(identity);
        const turn =
          state.active?.identity.requestId === identity.requestId
            ? state.active
            : (
                await this.conversations.history(identity, {
                  limit: 1,
                  requestIds: [identity.requestId],
                })
              ).turns[0];
        if (!turn || turn.identity.turnId !== identity.turnId)
          throw new Error('The durable tool has no current owning input.');
        const facts = DurableTurnMetadataSchema.parse(turn.metadata);
        const configuration = await this.conversations.configuration(identity);
        const { sessionId } = identity;
        const question = await this.store.getMessage(sessionId, turn.userMessageId);
        const plan = await prepareDurableTurn(
          this.preparation,
          {
            sessionId,
            userMessageId: turn.userMessageId,
            assistantMessageId: turn.assistantMessageId,
            parts: userInput(facts.userParts),
            ...submittedSkills(facts.userParts),
            modelId: facts.inferenceSnapshot.model.uniqueModelId,
            ...submittedEffort(configuration.options.reasoningEffort),
            ...(facts.inferenceSnapshot.imageGeneration
              ? { imageGeneration: facts.inferenceSnapshot.imageGeneration }
              : {}),
          },
          await this.conversations.resourceFileEntryIds(identity),
          signal,
          { through: question?.parentId ?? null, readOnlyTools: facts.readOnlyTools === true },
          facts.workspaceFolderId,
        );
        plan.usageAttribution.bindMessage({ id: turn.assistantMessageId, kind: 'agent-session' });
        for (const part of turn.parts)
          if (part.type === 'file')
            plan.resources.grantFile(FileEntryIdSchema.parse(part.ref.fileEntryId));
        const prepared = { turnId: identity.turnId, plan };
        this.prepared.set(key, prepared);
        return prepared;
      },
      signal,
    );
    this.preparing.set(key, operation);
    try {
      return await operation;
    } finally {
      this.preparing.delete(key);
    }
  }

  private async resolveTool(
    identity: RuntimeExecutionIdentity,
    ref: RuntimeToolRef,
    signal: AbortSignal,
  ): Promise<RuntimeTool> {
    const { plan } = await this.prepareExecution(identity, signal);
    const tool = (plan.imageGeneration ? [this.imageTool(plan)] : plan.tools).find((tool) =>
      sameRef(tool.ref, ref),
    );
    if (!tool) throw new Error('This capability is no longer available for the owning input.');
    return {
      ...tool,
      execute: async (call) => {
        const span = this.ports.traces?.startTrace(
          'pi.execute_tool',
          { ...identity, agentId: plan.agent.id },
          { 'tool.name': tool.providerName, 'tool.call.id': call.toolCallId },
        );
        try {
          const output = await tool.execute(call);
          if (span) {
            const diagnostic = toolResultDiagnostics(tool.ref, output);
            span.end(diagnostic.status, diagnostic.attributes);
          }
          return output;
        } catch (error) {
          span?.end(call.signal.aborted ? 'cancelled' : 'error', traceErrorAttributes(error));
          throw error;
        }
      },
    };
  }

  private imageTool(plan: TurnPlan): RuntimeTool {
    return {
      ref: { source: 'builtin', capabilityId: 'image_generation' },
      providerName: 'cherry_generate_image',
      displayName: 'Generate image',
      description: 'Execute the explicitly submitted image request.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      approval: 'auto',
      execute: async ({ signal }) => {
        if (!plan.imageGeneration) throw new Error('The image request is unavailable.');
        const entries = await plan.imageGeneration.execute(signal, plan.usageAttribution.resolve());
        return {
          value: { status: 'completed' },
          artifacts: entries.map((entry) => ({
            ref: { kind: 'managed-file', fileEntryId: entry.id },
            mediaType: entry.mediaType,
            name: entry.filename,
            kind: 'created',
          })),
        };
      },
    };
  }

  private async requestApproval(
    identity: RuntimeExecutionIdentity,
    approval: Parameters<RuntimeExecutionPorts['requestApproval']>[1],
    signal: AbortSignal,
  ) {
    const state = await this.attach(identity);
    signal.throwIfAborted();
    if (state.active?.identity.turnId !== identity.turnId)
      throw new Error('The approval has no active owning input.');
    let resolve!: (decision: 'approve' | 'deny') => void;
    let reject!: (error: unknown) => void;
    const response = new Promise<'approve' | 'deny'>((accept, refuse) => {
      resolve = accept;
      reject = refuse;
    });
    const view = toAgentApprovalView(approval, identity.sessionId);
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    state.approvals.set(approval.id, { view, resolve });
    const key = executionKey(identity, identity.requestId);
    const wait: NonNullable<RuntimeTurnTiming['approvals']>[number] = {
      approvalId: approval.id,
      toolCallId: approval.toolCallId,
      toolName: approval.displayName,
      startedAt: Date.now(),
    };
    this.approvalWaits.set(key, [...(this.approvalWaits.get(key) ?? []), wait]);
    this.publish(identity.sessionId, { type: 'approval.requested', approval: view });
    this.publishCurrentStatus(identity.sessionId, state);
    state.background?.awaitApproval(projectDurableHostTurn(state.active).assistant ?? undefined);
    try {
      const decision = await response;
      this.publish(identity.sessionId, {
        type: 'approval.resolved',
        approval: { ...view, status: decision === 'approve' ? 'approved' : 'denied' },
      });
      return decision;
    } finally {
      wait.completedAt = Date.now();
      signal.removeEventListener('abort', abort);
      state.approvals.delete(approval.id);
      this.publishCurrentStatus(identity.sessionId, state);
    }
  }

  private async askUser(
    question: Parameters<TurnPreparationDependencies['askUser']>[0],
    call: RuntimeToolCall,
  ) {
    const state = [...this.live.values()].find(
      (candidate) => candidate.active?.identity.turnId === call.turnId,
    );
    if (!state) throw new Error('The question has no active owning input.');
    const { sessionId } = state.lane;
    const response = state.questions.ask(question, call);
    state.question = { turnId: call.turnId, toolCallId: call.toolCallId, question };
    this.publish(sessionId, { type: 'question.updated', question: state.question });
    this.publishCurrentStatus(sessionId, state);
    state.background?.awaitApproval(
      state.active ? (projectDurableHostTurn(state.active).assistant ?? undefined) : undefined,
      'question',
    );
    try {
      return await response;
    } finally {
      state.question = null;
      this.publish(sessionId, { type: 'question.updated', question: null });
      this.publishCurrentStatus(sessionId, state);
    }
  }

  /** A copy is current while its revision matches its Cherry Session's history revision. */
  private async isCurrentConversation(lane: RuntimeLane) {
    const revision = await this.store.getRuntimeRevision(lane.sessionId);
    return revision !== null && revision === (await this.conversations.revision(lane));
  }

  /** Retires obsolete copies and settles reservations; returns the Session's current copies. */
  private async syncSession(sessionId: string, requireIdle = false) {
    await this.settlements.get(sessionId);
    const revision = await this.store.getRuntimeRevision(sessionId);
    const current: RuntimeLane[] = [];
    for (const copy of await this.conversations.lanes(sessionId))
      if (copy.revision === revision) current.push(copy.lane);
      else await this.detachLane(copy.lane);
    await this.reconcileUnsettled(sessionId);
    // Observation may lag native admission. Durable reservations also guard history mutations.
    if (
      requireIdle &&
      (await this.store.listUnsettledAssistantMessages()).some((row) => row.sessionId === sessionId)
    )
      fail('SESSION_BUSY', 'The session has unfinished work.');
    return current;
  }

  /** Each unsettled Cherry row is a durable receipt awaiting its full Pi result, with no cursor gaps. */
  private async reconcileUnsettled(onlySessionId?: string) {
    const rows = await this.store.listUnsettledAssistantMessages();
    const sessionCopies = new Map<string, RuntimeLane[]>();
    for (const row of rows) {
      if (onlySessionId && row.sessionId !== onlySessionId) continue;
      let copies = sessionCopies.get(row.sessionId);
      if (!copies) {
        const revision = await this.store.getRuntimeRevision(row.sessionId);
        copies = (await this.conversations.lanes(row.sessionId))
          .filter((copy) => copy.revision === revision)
          .map((copy) => copy.lane);
        sessionCopies.set(row.sessionId, copies);
      }
      // The answer ran on whichever current copy still holds it.
      let selected: Awaited<ReturnType<DurableAgentRuntime['message']>>;
      for (const lane of copies)
        if ((selected = await this.conversations.message(lane, row.assistantMessageId))) break;
      if (selected?.turn.identity.turnId === row.turnId) {
        if (selected.turn.status !== 'running' && selected.turn.status !== 'queued') {
          const turn = this.timed(selected.turn);
          await this.persistTurn(turn);
          if (this.live.has(laneKey(turn.identity))) this.presentSettled(turn);
        }
        continue;
      }
      // Reservation committed, but admission did not. Preserve any recorded output as interrupted.
      const message = await this.store.getMessage(row.sessionId, row.assistantMessageId);
      if (!message) continue;
      const completedAt = Date.now();
      const error: AgentErrorView = {
        code: 'INTERRUPTED',
        message: 'The app stopped before this input was admitted.',
        retryable: true,
      };
      await this.store.finalizeAssistantMessage({
        assistantMessageId: row.assistantMessageId,
        ...(row.turnId ? { turnId: row.turnId } : {}),
        status: 'interrupted',
        parts: settleInterruptedAssistantParts(
          message.parts,
          error,
          `error-${row.turnId ?? row.assistantMessageId}`,
        ),
        usage: message.stats,
        error,
        contextCheckpoint: null,
        runtimeStats: {
          runtimeTiming: { startedAt: Date.parse(message.createdAt), completedAt, spans: [] },
        },
      });
      this.ports.durableStorage?.notifyTranscript(row.sessionId);
      logger.warn('Agent reservation recovered as interrupted', {
        sessionId: row.sessionId,
        turnId: row.turnId,
        assistantMessageId: row.assistantMessageId,
        operation: 'ai.reconcile',
        reasonCode: 'not_admitted',
      });
    }
  }

  /** Called with admission blocked and no native work, including background compaction. */
  private async captureCheckpoints() {
    for (const { lane } of await this.conversations.sessions()) {
      if (!(await this.isCurrentConversation(lane))) continue;
      const latest = (await this.conversations.history(lane, { limit: 1 })).turns[0];
      if (latest?.status !== 'completed') continue;
      await this.traceOperation('ai.checkpoint', latest.identity, async () => {
        const { contextCheckpoint } = await this.conversations.exportTurn(
          lane,
          latest.identity.requestId,
          { currentContext: true },
        );
        if (contextCheckpoint)
          await this.store.saveContextCheckpoint(
            latest.assistantMessageId,
            latest.identity.turnId,
            contextCheckpoint,
          );
      });
    }
  }

  private async persistTurn(turn: RuntimeDurableTurn) {
    if (turn.status === 'cancelled' && turn.inputBoundary === null) {
      // A withdrawn inbox item never entered model context. Remove its reservation without
      // invalidating the working copy; reconciliation retries this after a process interruption.
      const { sessionId } = turn.identity;
      const messageIds = await this.store.discardQueuedTurn({
        sessionId,
        turnId: turn.identity.turnId,
      });
      if (messageIds.length) {
        this.publish(sessionId, { type: 'turn.deleted', turnId: turn.identity.turnId, messageIds });
        this.ports.durableStorage?.notifyTranscript(sessionId);
        const session = await this.store.getSession(sessionId);
        if (session) this.publish(sessionId, { type: 'session.updated', session });
      }
      this.prepared.delete(executionKey(turn.identity, turn.identity.requestId));
      return;
    }
    const { assistant, turn: view } = projectDurableHostTurn(turn);
    const status = turn.status;
    if (!assistant || status === 'running' || status === 'queued') return;
    await this.traceOperation(
      'ai.settlement',
      { ...turn.identity, messageId: assistant.id },
      async () => {
        const artifacts = await this.conversations.exportTurn(
          turn.identity,
          turn.identity.requestId,
        );
        const timing = durableRuntimeTiming(turn) ?? { startedAt: turn.createdAt, spans: [] };
        await this.store.finalizeAssistantMessage({
          assistantMessageId: assistant.id,
          turnId: turn.identity.turnId,
          status: status === 'completed' ? 'success' : status === 'failed' ? 'error' : status,
          parts: assistant.parts,
          usage: turn.usage,
          error: view.error,
          ...artifacts,
          runtimeStats: {
            ...(turn.contextTokens !== undefined ? { contextTokens: turn.contextTokens } : {}),
            runtimeTiming: {
              ...timing,
              completedAt: Math.max(timing.startedAt, timing.completedAt ?? turn.updatedAt),
            },
          },
        });
        this.ports.durableStorage?.notifyTranscript(turn.identity.sessionId);
      },
    );
    // Settlement can outlive the current UI turn, including recovery without an observer.
    this.recordTurnState({ ...turn.identity, messageId: assistant.id }, view.status, view.error);
  }

  private settle(turn: RuntimeDurableTurn) {
    // Settlement is serialized per Cherry Session across all of its copies.
    const { sessionId } = turn.identity;
    const operation = (this.settlements.get(sessionId) ?? Promise.resolve())
      .then(async () => {
        await this.persistTurn(turn);
        this.presentSettled(turn);
      })
      .catch((error: unknown) => {
        logger.warn(
          'Agent result remains in Pi until Cherry settlement can be retried',
          error as Error,
          {
            ...turn.identity,
            assistantMessageId: turn.assistantMessageId,
            operation: 'ai.settlement',
          },
        );
      });
    this.settlements.set(sessionId, operation);
    this.pendingWrites.add(operation);
    void operation.finally(() => {
      this.pendingWrites.delete(operation);
      if (this.settlements.get(sessionId) === operation) this.settlements.delete(sessionId);
    });
  }

  private async attach(copy: RuntimeLane): Promise<LiveSession> {
    const lane = runtimeLane(copy.sessionId, copy.slot);
    const key = laneKey(lane);
    const existing = this.live.get(key);
    if (existing) return existing;
    const pending = this.attachments.get(key);
    if (pending) return pending;
    const operation = this.traceOperation('ai.observe', { sessionId: lane.sessionId }, async () => {
      const state: LiveSession = {
        lane,
        waiters: new Set(),
        users: new Set(),
        assistant: null,
        active: null,
        queue: [],
        contextStatus: null,
        unsubscribe: async () => {},
        background: null,
        backgroundRequestId: null,
        backgroundCompleted: false,
        turn: null,
        lastAnswerId: null,
        question: null,
        questions: new TurnUserQuestions(),
        approvals: new Map(),
      };
      // The engine's exact watch is acquired before scheduling. App route listeners are independent.
      let installed = false;
      const pending: RuntimeConversationEvent[] = [];
      const observed = await this.conversations.observe(lane, (event) => {
        if (installed) this.consume(state, event);
        else pending.push(event);
      });
      state.active = observed.snapshot.activeTurn && this.timed(observed.snapshot.activeTurn);
      state.contextStatus = observed.snapshot.contextStatus ?? null;
      state.unsubscribe = observed.unsubscribe;
      this.live.set(key, state);
      this.updateQueue(state, observed.snapshot.queue);
      if (state.active) this.present(state.active);
      installed = true;
      for (const event of pending) this.consume(state, event);
      return state;
    });
    this.attachments.set(key, operation);
    try {
      return await operation;
    } finally {
      this.attachments.delete(key);
    }
  }

  private consume(state: LiveSession, event: RuntimeConversationEvent) {
    const { sessionId } = state.lane;
    if (event.type === 'snapshot') {
      state.active = event.snapshot.activeTurn && this.timed(event.snapshot.activeTurn);
      this.updateQueue(state, event.snapshot.queue);
      state.contextStatus = event.snapshot.contextStatus ?? null;
      this.publish(sessionId, { type: 'context.updated', status: state.contextStatus });
      if (state.active) this.present(state.active);
    } else if (event.type === 'context.updated') {
      state.contextStatus = event.status;
      this.publish(sessionId, event);
    } else if (event.type === 'queue.updated') {
      this.updateQueue(state, event.queue);
    } else {
      const turn = this.timed(event.turn);
      if (
        turn.status !== 'queued' &&
        state.queue.some((item) => item.identity.turnId === turn.identity.turnId)
      )
        this.updateQueue(
          state,
          state.queue.filter((item) => item.identity.turnId !== turn.identity.turnId),
        );
      if (turn.status === 'running') state.active = turn;
      this.present(turn);
      if (
        turn.status !== 'running' &&
        turn.status !== 'queued' &&
        state.active?.identity.requestId === turn.identity.requestId
      )
        state.active = null;
    }
    for (const waiter of state.waiters)
      if (state.active?.identity.requestId === waiter.requestId) waiter.resolve();
  }

  private timed(turn: RuntimeDurableTurn): RuntimeDurableTurn {
    const approvals = this.approvalWaits.get(executionKey(turn.identity, turn.identity.requestId));
    if (!approvals?.length || !turn.timing) return turn;
    return {
      ...turn,
      timing: { ...turn.timing, approvals: approvals.map((wait) => ({ ...wait })) },
    };
  }

  private present(turn: RuntimeDurableTurn) {
    if (turn.status !== 'running' && turn.status !== 'queued') {
      this.settle(turn);
      return;
    }
    this.presentSettled(turn);
  }

  private presentSettled(turn: RuntimeDurableTurn) {
    if (turn.status === 'queued' || (turn.status === 'cancelled' && turn.inputBoundary === null))
      return;
    const lane = turn.identity;
    const { sessionId } = lane;
    const state = this.live.get(laneKey(lane));
    this.publishRows(turn);
    const view = projectDurableHostTurn(turn);
    const projected = state ? this.turnStatus(view.turn, state) : view.turn;
    const terminal = turn.status !== 'running';
    // Another answer of the same Session still runs: it keeps the Session busy.
    const sibling = terminal
      ? this.liveStates(sessionId).find((candidate) => candidate !== state && candidate.active)
      : undefined;
    if (sibling) this.publishCurrentStatus(sessionId, sibling);
    // Cherry settlement can finish after Pi has already started the next queued input.
    else if (
      !terminal ||
      !state?.active ||
      state.active.identity.requestId === turn.identity.requestId
    )
      this.publishTurn(sessionId, state, projected, !terminal);
    if (!terminal) {
      if (state?.background && state.backgroundRequestId !== turn.identity.requestId) {
        state.background.retire();
        state.background = null;
        state.backgroundRequestId = null;
      }
      // One background reply per Session, even while several answers run.
      if (
        state &&
        !state.background &&
        !this.liveStates(sessionId).some((candidate) => candidate.background)
      )
        this.track(
          (async () => {
            const session = await this.store.getSession(sessionId);
            const prepared = this.prepared.get(executionKey(lane, turn.identity.requestId));
            const agent =
              prepared?.plan.agent ??
              (session ? await this.ports.agents.getAgent(session.agentId) : null);
            if (
              !agent ||
              this.liveStates(sessionId).some((candidate) => candidate.background) ||
              state.active?.identity.requestId !== turn.identity.requestId
            )
              return;
            state.background = this.background.startTurn({
              sessionId,
              sessionTitle: session?.name ?? '',
              agentId: agent.id,
              agentName: agent.name,
              onInterrupt: () => this.suspend(),
            });
            state.backgroundRequestId = turn.identity.requestId;
            state.backgroundCompleted = false;
            if (view.assistant) state.background.update(view.assistant);
          })(),
        );
      if (view.assistant) state?.background?.update(view.assistant);
    } else {
      if (state?.backgroundRequestId === turn.identity.requestId) this.passBackground(state, turn);
      else if (turn.status === 'completed') {
        const holder = this.liveStates(sessionId).find(
          (candidate) => candidate !== state && candidate.background,
        );
        if (holder) holder.backgroundCompleted = true;
      }
      const prepared = this.prepared.get(executionKey(lane, turn.identity.requestId));
      this.prepared.delete(executionKey(lane, turn.identity.requestId));
      this.approvalWaits.delete(executionKey(lane, turn.identity.requestId));
      // Only the first question's leading answer names the Session.
      if (
        turn.status === 'completed' &&
        lane.slot === 0 &&
        prepared &&
        !prepared.plan.hasMessages &&
        view.assistant
      )
        this.renameFrom(
          this.naming.maybeRenameFromConversationSummary({
            sessionId,
            userParts: prepared.plan.inputParts,
            assistantParts: view.assistant.parts,
          }),
        );
      this.ports.durableStorage?.notifyTranscript(sessionId);
    }
  }

  /**
   * The background reply of a Session outlives the answer it started with: iOS and
   * Android 12+ cannot start it again from the background. A still-running answer of
   * the question takes it over; the last one to end finishes it, completed when any
   * answer completed and otherwise with its own outcome.
   */
  private passBackground(state: LiveSession, turn: RuntimeDurableTurn) {
    const { background } = state;
    const completed = state.backgroundCompleted || turn.status === 'completed';
    state.background = null;
    state.backgroundRequestId = null;
    state.backgroundCompleted = false;
    if (!background) return;
    const heir = this.liveStates(state.lane.sessionId).find(
      (candidate) => candidate !== state && candidate.active && !candidate.background,
    );
    if (heir?.active) {
      heir.background = background;
      heir.backgroundRequestId = heir.active.identity.requestId;
      heir.backgroundCompleted = completed;
      const assistant = projectDurableHostTurn(heir.active).assistant ?? undefined;
      if (heir.question || heir.approvals.size)
        background.awaitApproval(assistant, heir.question ? 'question' : undefined);
      else if (assistant) background.update(assistant);
      return;
    }
    background.finish(
      completed ? 'completed' : turn.status === 'cancelled' ? 'cancelled' : 'failed',
    );
  }

  private publishRows(turn: RuntimeDurableTurn) {
    const { user, assistant } = projectDurableHostTurn(turn);
    const { sessionId } = turn.identity;
    const state = this.live.get(laneKey(turn.identity));
    if (!state?.users.has(user.id)) {
      // The answers of one question share it: the Session shows it once.
      const shown = this.liveStates(sessionId).some((candidate) => candidate.users.has(user.id));
      state?.users.add(user.id);
      if (!shown) this.publish(sessionId, { type: 'message.created', message: user });
    }
    if (!assistant) return;
    const terminal = turn.status !== 'running' && turn.status !== 'queued';
    const previous = state?.assistant;
    if (terminal) this.publish(sessionId, { type: 'message.finalized', message: assistant });
    else if (
      !previous ||
      previous.id !== assistant.id ||
      previous.parts.some((part, index) => assistant.parts[index]?.id !== part.id)
    )
      this.publish(sessionId, { type: 'message.created', message: assistant });
    else
      for (const [index, part] of assistant.parts.entries()) {
        const old = previous.parts[index];
        if (!old)
          this.publish(sessionId, {
            type: 'message.delta',
            messageId: assistant.id,
            delta: { op: 'part.add', index, part },
          });
        else if (
          (part.type === 'text' || part.type === 'reasoning') &&
          old.type === part.type &&
          part.state === old.state &&
          part.text.startsWith(old.text)
        ) {
          const text = part.text.slice(old.text.length);
          if (text)
            this.publish(sessionId, {
              type: 'message.delta',
              messageId: assistant.id,
              delta: { op: 'text.append', partId: part.id, text },
            });
        } else if (JSON.stringify(old) !== JSON.stringify(part))
          this.publish(sessionId, {
            type: 'message.delta',
            messageId: assistant.id,
            delta: { op: 'part.replace', part },
          });
      }
    if (state) {
      // Queue placeholders do not replace the current active assistant presentation.
      if (!terminal && turn.status !== 'queued') state.assistant = assistant;
      else if (terminal && state.assistant?.id === assistant.id) state.assistant = null;
      if (terminal) state.users.delete(user.id);
    }
  }

  private turnStatus(turn: AgentTurnView, state: LiveSession): AgentTurnView {
    if (turn.status !== 'running') return turn;
    return {
      ...turn,
      status: state.question
        ? 'awaiting-input'
        : state.approvals.size
          ? 'awaiting-approval'
          : 'running',
    };
  }
  private publishCurrentStatus(sessionId: string, state: LiveSession) {
    if (!state.active) return;
    this.publishTurn(
      sessionId,
      state,
      this.turnStatus(projectDurableHostTurn(state.active).turn, state),
    );
  }
  /**
   * Publishes a copy's turn. Streamed updates republish only a changed view: answers
   * of one question run on several copies, and alternating their unchanged views
   * would refresh every observer on each delta.
   */
  private publishTurn(
    sessionId: string,
    state: LiveSession | undefined,
    turn: AgentTurnView,
    changedOnly = false,
  ) {
    const previous = state?.turn;
    if (
      changedOnly &&
      previous &&
      Object.keys(previous).length === Object.keys(turn).length &&
      (Object.keys(turn) as (keyof AgentTurnView)[]).every((key) => previous[key] === turn[key])
    )
      return;
    if (state) state.turn = turn.endedAt === null ? turn : null;
    this.publish(sessionId, { type: 'turn.updated', turn });
    this.setStatus(sessionId, { turnId: turn.id, status: turn.status });
  }

  private async waitForOwner(lane: RuntimeLane, requestId: string, signal: AbortSignal) {
    const state = await this.attach(lane);
    signal.throwIfAborted();
    if (state.active?.identity.requestId === requestId) return;
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    const waiter = { requestId, resolve };
    state.waiters.add(waiter);
    try {
      await raceAbort(promise, signal);
    } finally {
      state.waiters.delete(waiter);
    }
  }
  private publish(sessionId: string, event: AgentEvent) {
    const value = AgentEventSchema.parse(JSON.parse(JSON.stringify(event)));
    for (const listener of this.listeners.get(sessionId) ?? [])
      try {
        listener(value);
      } catch (error) {
        logger.warn('Agent listener failed', error as Error, {
          sessionId,
          operation: 'agent.listener',
        });
      }
  }
  private setStatus(sessionId: string, status: AgentSessionStatus | null) {
    const previous = this.statuses.get(sessionId);
    if (previous?.turnId === status?.turnId && previous?.status === status?.status) return;
    // Terminal outcomes are recorded by persistence, independently of the current UI status.
    if (
      status &&
      ['running', 'awaiting-approval', 'awaiting-input', 'cancelling'].includes(status.status)
    )
      this.recordTurnState({ sessionId, turnId: status.turnId }, status.status);
    if (status) this.statuses.set(sessionId, Object.freeze(status));
    else this.statuses.delete(sessionId);
    for (const listener of this.statusListeners.get(sessionId) ?? [])
      try {
        listener();
      } catch (error) {
        logger.warn('Agent status listener failed', error as Error, {
          sessionId,
          operation: 'agent.status_listener',
        });
      }
  }
  private recordTurnState(
    context: TraceContext,
    status: AgentSessionStatus['status'],
    error?: AgentErrorView | null,
  ) {
    const span = this.ports.traces?.startTrace('ai.turn_state', context, {
      'agent.turn.status': status,
      ...traceErrorAttributes(error),
    });
    span?.end(
      status === 'failed'
        ? 'error'
        : status === 'cancelled'
          ? 'cancelled'
          : status === 'interrupted'
            ? 'interrupted'
            : 'ok',
    );
  }
  private renameFrom(operation: Promise<AgentSessionView | null>) {
    this.track(
      operation.then((session) => {
        if (session) {
          this.publish(session.id, { type: 'session.updated', session });
          this.background.updateSessionTitle(session.id, session.name);
        }
      }),
    );
  }
  private track(operation: Promise<unknown>) {
    const tracked = operation.catch((error) =>
      logger.warn('Agent projection failed', error as Error, { operation: 'agent.projection' }),
    );
    this.pendingWrites.add(tracked);
    void tracked.finally(() => this.pendingWrites.delete(tracked));
  }
  private async requireSession(sessionId: string) {
    const session = await this.store.getSession(sessionId);
    if (!session) fail('SESSION_NOT_FOUND', `Session does not exist: ${sessionId}`);
    return session;
  }
  private assertIdle(sessionId: string) {
    storageMutationGate.assertWritable();
    if (
      this.deleting.has(sessionId) ||
      this.admissions.has(sessionId) ||
      this.busyLanes(sessionId).length ||
      this.settlements.has(sessionId)
    )
      fail('SESSION_BUSY', 'The session has unfinished work.');
  }
  private admit<Result>(
    sessionId: string,
    operation: (signal: AbortSignal) => Promise<Result>,
  ): Promise<Result> {
    // A submission reopens a suspended engine, as observing a session does: a new chat has no
    // session on screen to carry the retry action.
    if (this.suspended && !this.controller.signal.aborted)
      return this.resumeSuspended().then(() => this.admit(sessionId, operation));
    if (!this.accepting)
      fail('EXECUTION_UNAVAILABLE', 'The Agent Host is not accepting submissions.');
    storageMutationGate.assertWritable();
    if (this.deleting.has(sessionId) || this.admissions.has(sessionId))
      fail('SESSION_BUSY', 'This session is already admitting input.');
    const controller = new AbortController();
    const lease = this.background.acquirePreparation(sessionId, (reason) =>
      controller.abort(reason),
    );
    const promise = Promise.resolve()
      .then(() =>
        this.traceOperation(
          'ai.admission',
          { sessionId },
          () => operation(controller.signal),
          controller.signal,
        ),
      )
      .catch((error: unknown) => {
        if (controller.signal.reason instanceof AgentProtocolError) throw controller.signal.reason;
        throw error;
      })
      .finally(() => {
        this.admissions.delete(sessionId);
        lease.release();
      });
    this.admissions.set(sessionId, { controller, promise });
    return promise;
  }

  private recordQueue(
    sessionId: string,
    queue: readonly RuntimeDurableTurn[],
    previous: readonly RuntimeDurableTurn[],
  ) {
    // Queue events describe membership changes, not streamed content updates.
    if (!queue.length && !previous.length) return;
    const span = this.ports.traces?.startTrace(
      'ai.queue',
      { sessionId },
      { 'agent.queue.length': queue.length },
    );
    span?.end('ok');
    for (const turn of queue) {
      if (previous.some((item) => item.identity.requestId === turn.identity.requestId)) continue;
      this.ports.traces
        ?.startTrace(
          'ai.turn_state',
          { ...turn.identity, messageId: turn.assistantMessageId },
          { 'agent.turn.status': 'queued' },
        )
        ?.end('ok');
    }
  }

  private queuedInputs(queue: readonly RuntimeDurableTurn[]): AgentQueuedInput[] {
    return queue.map((turn) => ({
      turnId: turn.identity.turnId,
      userMessage: projectDurableHostTurn(turn).user,
      assistantMessageId: turn.assistantMessageId,
    }));
  }

  private updateQueue(state: LiveSession, queue: readonly RuntimeDurableTurn[]) {
    if (
      state.queue.length === queue.length &&
      state.queue.every(
        (turn, index) => turn.identity.requestId === queue[index].identity.requestId,
      )
    )
      return;
    const { sessionId } = state.lane;
    this.recordQueue(sessionId, queue, state.queue);
    state.queue = queue;
    this.publish(sessionId, {
      type: 'queue.updated',
      inputs: this.queuedInputs(this.liveStates(sessionId).flatMap((candidate) => candidate.queue)),
    });
  }

  private async traceOperation<Value>(
    name:
      | 'ai.admission'
      | 'ai.suspend'
      | 'ai.prepare'
      | 'ai.observe'
      | 'ai.settlement'
      | 'ai.checkpoint',
    context: TraceContext,
    operation: () => Promise<Value>,
    signal?: AbortSignal,
  ): Promise<Value> {
    const span = this.ports.traces?.startTrace(name, context);
    try {
      const result = await operation();
      span?.end('ok');
      return result;
    } catch (error) {
      span?.end(signal?.aborted ? 'cancelled' : 'error', traceErrorAttributes(error));
      if (!signal?.aborted)
        logger.error('Agent operation failed', {
          ...context,
          assistantMessageId: context.messageId,
          operation: name,
          error,
        });
      throw error;
    }
  }
}

function fail(
  code: ConstructorParameters<typeof AgentProtocolError>[0]['code'],
  message: string,
): never {
  throw new AgentProtocolError({
    code,
    message,
    retryable: code === 'SESSION_BUSY' || code === 'EXECUTION_UNAVAILABLE',
  });
}
/** Keyed by copy: answers of one question share a turn but never a copy and request. */
function executionKey(lane: RuntimeLane, requestId: string) {
  return `${laneKey(lane)}:${requestId}`;
}

/**
 * Runs one step of every answer together. The first failure stops the others and
 * is rethrown once all have settled, so no step outlives the admission.
 */
async function eachAnswer<Item, Result>(
  items: readonly Item[],
  signal: AbortSignal,
  run: (item: Item, index: number, signal: AbortSignal) => Promise<Result>,
): Promise<Result[]> {
  const controller = new AbortController();
  const stop = () => controller.abort(signal.reason);
  if (signal.aborted) stop();
  else signal.addEventListener('abort', stop, { once: true });
  let failure: { error: unknown } | undefined;
  const results = await Promise.all(
    items.map((item, index) =>
      run(item, index, controller.signal).catch((error: unknown) => {
        failure ??= { error };
        controller.abort(error);
        return undefined;
      }),
    ),
  ).finally(() => signal.removeEventListener('abort', stop));
  if (failure) throw failure.error;
  return results as Result[];
}

/** Answers of one question read each managed image once and share its bytes. */
function sharedImageReads(
  files: Pick<ManagedFileResolver, 'readAsDataUrl'>,
): Pick<ManagedFileResolver, 'readAsDataUrl'> {
  const reads = new Map<string, Promise<string | undefined>>();
  return {
    readAsDataUrl: (file, signal) => {
      let read = reads.get(file.fileEntryId);
      if (!read) reads.set(file.fileEntryId, (read = files.readAsDataUrl(file, signal)));
      return read;
    },
  };
}

/** Whether `a`'s model keeps more of a rebuilt history than `b`'s: images, then context. */
function keepsMoreHistory(a: ReplyTarget, b: ReplyTarget) {
  const images = (target: ReplyTarget) =>
    target.plan.modelPreflight?.inputModalities.includes('image') === true;
  if (images(a) !== images(b)) return images(a);
  return (
    (a.plan.modelPreflight?.maxInputTokens ?? 0) > (b.plan.modelPreflight?.maxInputTokens ?? 0)
  );
}

/** The question's answers in requested order; the first uses the composer's model. */
function replyTargets(input: AgentSubmitMessageInput | AgentStartSessionInput) {
  const answers = [
    {
      assistantMessageId: input.assistantMessageId,
      ...(input.modelId ? { modelId: input.modelId } : {}),
    },
    ...(input.additionalReplies ?? []),
  ];
  if (answers.length > 1) {
    const models = answers.map((answer) => answer.modelId);
    if (models.some((model) => !model) || new Set(models).size !== models.length)
      fail('CAPABILITY_UNSUPPORTED', 'Each parallel answer needs a different model.');
    if (new Set(answers.map((answer) => answer.assistantMessageId)).size !== answers.length)
      fail('MESSAGE_NOT_FOUND', 'Each parallel answer needs its own message id.');
  }
  return answers;
}

function configurationKey(configuration: RuntimeConversationSeed['configuration']) {
  const facts = {
    kind: configuration.kind ?? 'language',
    model: configuration.model,
    instructions: configuration.instructions,
    initialInstructions: configuration.initialInstructions ?? [],
    options: configuration.options,
    tools: configuration.tools.map((tool) => ({
      ref: tool.ref,
      providerName: tool.providerName,
      displayName: tool.displayName,
      description: tool.description,
      inputSchema: tool.inputSchema,
      inputPreview: tool.inputPreview,
      approval: tool.approval,
      failureGroup: tool.failureGroup,
      autoApprovalEligible: tool.autoApprovalEligible,
      deferred: tool.deferred,
    })),
    webTools: configuration.webTools,
  };
  return JSON.stringify(facts, (_key, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );
}
function sameRef(left: RuntimeToolRef, right: RuntimeToolRef) {
  return (
    left.source === right.source &&
    (left.source === 'builtin' && right.source === 'builtin'
      ? left.capabilityId === right.capabilityId
      : left.source === 'mcp' &&
        right.source === 'mcp' &&
        left.serverId === right.serverId &&
        left.rawToolName === right.rawToolName)
  );
}
/** Explicit Skill selections and app-owned Skill actions recorded on a submitted message. */
function submittedSkills(parts: AgentMessageView['parts']) {
  const text = parts.flatMap((part) => (part.type === 'text' ? [part] : []));
  const skillIds = text.flatMap((part) =>
    (part.skillSelections ?? []).map(({ skillId }) => skillId),
  );
  const skillAction = text.find((part) => part.skillAction)?.skillAction;
  return {
    ...(skillIds.length ? { skillIds } : {}),
    ...(skillAction ? { skillAction } : {}),
  };
}

function userInput(parts: AgentMessageView['parts']): AgentInputPart[] {
  return parts.flatMap((part) => {
    // A selection made without typed text is recorded on an empty text part.
    if (part.type === 'text' && !part.text) return [];
    if (part.type === 'text')
      return [
        AgentInputPartSchema.parse({
          type: part.type,
          text: part.text,
          ...(part.pluginReferences ? { pluginReferences: part.pluginReferences } : {}),
          ...(part.skillReferences ? { skillReferences: part.skillReferences } : {}),
        }),
      ];
    if (part.type === 'file')
      return [
        AgentInputPartSchema.parse({
          type: part.type,
          fileEntryId: part.fileEntryId,
          mediaType: part.mediaType,
          ...(part.filename !== undefined ? { filename: part.filename } : {}),
        }),
      ];
    return [];
  });
}
