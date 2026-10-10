import { ReasoningEffortOptionSchema } from '@cherrystudio/universal/types/aiSdk';
import { v7 as uuidv7 } from 'uuid';

import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import type {
  BackgroundReplyLifecycle,
  BackgroundReplyTurn,
} from '@/backend/services/backgroundReply';
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
  type AgentSessionObservation,
  type AgentSessionStatus,
  type AgentSessionView,
  type AgentStartSessionInput,
  type AgentSubmitMessageInput,
  type AgentTurnView,
} from '@/shared/contracts/agent';
import { BackupError } from '@/shared/contracts/backup';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { FileEntryIdSchema } from '@/shared/data/types/file';

import {
  raceAbort,
  type AgentRuntime,
  type DurableAgentRuntime,
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
import { buildAgentSystemPrompt } from './agentSystemPrompt';
import {
  durableRuntimeTiming,
  DurableTurnMetadataSchema,
  projectDurableHostTurn,
} from './durableHostProjection';
import { toAgentApprovalView } from './runtimeProjection';
import { materializeRuntimeAttachments } from './turnAttachments';
import {
  prepareDurableTurn,
  prepareInitialTurn,
  prepareTurn,
  type TurnPlan,
  type TurnPreparationDependencies,
} from './turnPreparation';
import { toRuntimeHistory, toRuntimeInputParts } from './turnRuntimeInput';
import { TurnUserQuestions } from './TurnUserQuestions';

const logger = loggerService.withContext('DurableAgentHost');
type Admission = { controller: AbortController; promise: Promise<unknown> };
type LiveSession = {
  waiters: Set<{ requestId: string; resolve: () => void }>;
  users: Set<string>;
  assistant: AgentMessageView | null;
  active: RuntimeDurableTurn | null;
  queue: readonly RuntimeDurableTurn[];
  unsubscribe: () => Promise<void>;
  background: BackgroundReplyTurn | null;
  backgroundRequestId: string | null;
  question: AgentPendingQuestion | null;
  questions: TurnUserQuestions;
  approvals: Map<
    string,
    { view: AgentApprovalView; resolve: (decision: 'approve' | 'deny') => void }
  >;
};
type PreparedInput = { turnId: string; plan: TurnPlan };

/** Runtime options use Pi's `off`; a resubmitted input uses the protocol's `none`. */
function submittedEffort(value: string | undefined) {
  const reasoningEffort = ReasoningEffortOptionSchema.safeParse(
    value === 'off' ? 'none' : value,
  ).data;
  return reasoningEffort ? { reasoningEffort } : {};
}

/** Business operations and disposable presentation over the persistent engine; no model loop. */
export class DurableAgentHost implements AgentProtocol {
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
  private suspended = false;
  private workWatch: { unsubscribe(): Promise<void> } | undefined;
  private executionLease: { release(): void } | undefined;

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
  pendingTurns(sessionId: string) {
    return this.live.get(sessionId)?.queue ?? [];
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
      traceModel: async (identity) => {
        const session = await this.store.getSession(identity.sessionId);
        const prepared = identity.requestId
          ? this.prepared.get(executionKey(identity.sessionId, identity.requestId))
          : undefined;
        return this.ports.traces?.startTrace(
          'pi.generate_content',
          {
            agentId: prepared?.plan.agent.id ?? session?.agentId,
            sessionId: identity.sessionId,
            ...(identity.turnId ? { turnId: identity.turnId } : {}),
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
        if (!session || !(await this.isCurrentConversation(identity.sessionId)))
          fail('SESSION_NOT_FOUND', 'The execution no longer has a current Cherry owner.');
        if (session && !(await this.ports.agents.getAgent(session.agentId)))
          fail('AGENT_NOT_FOUND', `Agent does not exist: ${session.agentId}`);
        if (identity.requestId) {
          await this.waitForOwner(identity.sessionId, identity.requestId, signal);
          const prepared = this.prepared.get(executionKey(identity.sessionId, identity.requestId));
          if (prepared)
            for (const id of await this.conversations.resourceFileEntryIds(identity.sessionId))
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
          ? this.prepared.get(executionKey(identity.sessionId, identity.requestId))
          : undefined;
        const session = await this.store.getSession(identity.sessionId);
        const agentId = prepared?.plan.agent.id ?? session?.agentId;
        // Deleted owners are never reconstructed from the disposable execution log.
        if (!agentId) return;
        const selected = identity.requestId
          ? (
              await this.conversations.history(identity.sessionId, {
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
    await this.conversations.initialize(await this.ports.durableStorage.open(), execution);
    try {
      const copies = await this.conversations.sessions();
      // Upstream abort enables scheduling too. Attach current owners before retiring stale copies.
      for (const sessionId of await this.conversations.unfinishedSessions())
        if (await this.isCurrentConversation(sessionId)) await this.attach(sessionId);
      for (const { sessionId } of copies)
        if (!(await this.isCurrentConversation(sessionId)))
          await this.conversations.discardConversation(sessionId);
      // Working copies outlive the process: continuing a conversation reuses its native context.
      await this.reconcileUnsettled();
      await this.conversations.drainUsage();
      const work = await this.conversations.watchWork((active) => this.protectWork(active));
      this.workWatch = work;
      this.protectWork(work.active);
      this.accepting = true;
      this.conversations.resume();
    } catch (error) {
      await this.close();
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
    await this.suspension;
    await this.workWatch?.unsubscribe();
    this.workWatch = undefined;
    await Promise.allSettled([...this.admissions.values()].map((admission) => admission.promise));
    await Promise.allSettled([...this.attachments.values()]);
    await Promise.allSettled([...this.live.values()].map((state) => state.unsubscribe()));
    await Promise.allSettled([...this.pendingWrites]);
    await this.conversations.close();
    await this.naming.drain();
    for (const state of this.live.values()) state.background?.retire();
    this.live.clear();
    this.prepared.clear();
    this.preparing.clear();
    this.listeners.clear();
    this.executionLease?.release();
    this.executionLease = undefined;
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
  private suspend(): Promise<void> {
    if (this.controller.signal.aborted) return this.closing ?? Promise.resolve();
    return (this.suspension ??= (async () => {
      this.accepting = false;
      this.suspended = true;
      for (const admission of this.admissions.values())
        admission.controller.abort(new Error('Background execution expired.'));
      await Promise.allSettled([...this.admissions.values()].map((entry) => entry.promise));
      await this.workWatch?.unsubscribe();
      this.workWatch = undefined;
      await Promise.allSettled([...this.attachments.values()]);
      await Promise.allSettled([...this.live.values()].map((state) => state.unsubscribe()));
      await Promise.allSettled([...this.pendingWrites]);
      await this.conversations.close();
      for (const state of this.live.values()) state.background?.retire();
      this.live.clear();
      this.prepared.clear();
      this.preparing.clear();
      this.executionLease?.release();
      this.executionLease = undefined;
    })());
  }

  async resumeSuspended() {
    if (!this.suspended || this.controller.signal.aborted) return;
    await this.suspension;
    if (this.controller.signal.aborted || !this.suspended) return;
    this.suspended = false;
    this.suspension = undefined;
    await this.initialize();
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
      const plan = await prepareInitialTurn(this.preparation, parsed, signal);
      await this.submitPrepared(parsed, plan, signal);
      return this.requireSession(parsed.sessionId);
    });
  }

  submitMessage(input: AgentSubmitMessageInput) {
    return this.submitNative(AgentSubmitMessageInputSchema.parse(input));
  }

  private submitNative(parsed: AgentSubmitMessageInput) {
    return this.admit(parsed.sessionId, async (signal) => {
      await this.requireSession(parsed.sessionId);
      await this.syncSession(parsed.sessionId);
      const native = await this.isCurrentConversation(parsed.sessionId);
      const plan = native
        ? await prepareDurableTurn(
            this.preparation,
            parsed,
            await this.conversations.resourceFileEntryIds(parsed.sessionId),
            signal,
          )
        : await prepareTurn(this.preparation, parsed, signal);
      return this.submitPrepared(parsed, plan, signal);
    });
  }

  private async submitPrepared(
    input: AgentSubmitMessageInput,
    plan: TurnPlan,
    signal: AbortSignal,
    retryReservation?: ReserveSubmissionResult,
  ) {
    if (!plan.imageGeneration && !plan.modelPreflight)
      throw new Error('A text input requires model preflight.');
    const attachments = plan.imageGeneration
      ? new Map()
      : await materializeRuntimeAttachments({
          files: this.ports.files,
          history: plan.history,
          inputParts: plan.inputParts,
          modelPreflight: plan.modelPreflight!,
          resources: plan.resources,
          signal,
          contentAttachments: plan.runtimeContentAttachments,
        });
    const session = await this.store.getSession(input.sessionId);
    const configuration = this.configuration(plan);
    const native = await this.isCurrentConversation(input.sessionId);
    if (!native) {
      if (await this.conversations.hasConversation(input.sessionId))
        await this.detachConversation(input.sessionId);
      await this.conversations.ensureConversation(
        {
          sessionId: input.sessionId,
          revision: (await this.store.getRuntimeRevision(input.sessionId)) ?? 0,
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
    } else {
      const state = this.live.get(input.sessionId);
      if (state?.active || state?.queue.length) {
        const current = await this.conversations.configuration(input.sessionId);
        if (configurationKey(current) !== configurationKey(configuration))
          fail('SESSION_BUSY', 'Wait for the current turn before changing its configuration.');
      } else await this.conversations.configure(input.sessionId, configuration);
    }
    signal.throwIfAborted();
    const reservation = {
      sessionId: input.sessionId,
      userMessageId: input.userMessageId,
      assistantMessageId: input.assistantMessageId,
      userParts: plan.userParts,
      modelId: plan.inferenceSnapshot.model.uniqueModelId,
      inferenceSnapshot: plan.inferenceSnapshot,
    };
    const reserved =
      retryReservation ??
      (session
        ? await this.store.reserveSubmission(reservation)
        : await this.store.reserveInitialSubmission({
            ...reservation,
            agentId: plan.agent.id,
          }));
    const { turnId } = reserved;
    const requestId = turnId;
    // Cherry owns the identities before the engine can execute. Recovery reconciles this pair.
    try {
      await this.attach(input.sessionId);
      signal.throwIfAborted();
      plan.usageAttribution.bindMessage({ id: input.assistantMessageId, kind: 'agent-session' });
      this.prepared.set(executionKey(input.sessionId, requestId), { turnId, plan });
      await this.conversations.submit(input.sessionId, {
        requestId,
        turnId,
        userMessageId: input.userMessageId,
        assistantMessageId: input.assistantMessageId,
        createdAt: Date.parse(reserved.assistantMessage.updatedAt),
        input: plan.imageGeneration
          ? plan.inputParts.map((part) => ({
              type: 'text' as const,
              text:
                part.type === 'text'
                  ? part.text
                  : `[Image input: ${part.filename ?? part.fileEntryId}]`,
            }))
          : toRuntimeInputParts(plan.inputParts, plan.resources, attachments),
        ...(plan.retry?.resumeParts.length
          ? {
              resume: toRuntimeHistory([
                { ...reserved.assistantMessage, parts: plan.retry.resumeParts },
              ]).flatMap((turn) => turn.messages.flatMap((message) => message.parts)),
            }
          : {}),
        metadata: {
          ...(plan.retry?.resumeParts.length
            ? { retainedParts: reserved.assistantMessage.parts as unknown as RuntimeJsonValue[] }
            : {}),
          // Schema-validated parts are plain JSON; their interface types lack index signatures.
          userParts: plan.userParts as unknown as RuntimeJsonValue[],
          inferenceSnapshot: plan.inferenceSnapshot,
          referencedFileEntryIds: [...plan.resources.inputFiles.keys()],
          hasHistoryBeforeActiveTurn: plan.hasMessages,
        },
      });
    } catch (error) {
      // Admission can fail after its native commit. Re-read before marking a reservation interrupted.
      await this.reconcileUnsettled(input.sessionId);
      throw error;
    }
    if (!plan.hasMessages)
      this.renameFrom(
        this.naming.maybeRenameFromFirstUserMessage(input.sessionId, plan.inputParts),
      );
    return {
      turnId,
      userMessageId: input.userMessageId,
      assistantMessageId: input.assistantMessageId,
    };
  }

  private configuration(plan: TurnPlan): RuntimeConversationSeed['configuration'] {
    return {
      kind: plan.imageGeneration ? 'image' : 'language',
      model: plan.agent.model,
      options: plan.agent.options,
      tools: plan.imageGeneration ? [this.imageTool(plan)] : plan.tools,
      instructions: buildAgentSystemPrompt({
        agentInstructions: plan.agent.instructions,
        appLanguage: this.ports.appLanguage(),
        tools: plan.tools,
        pluginGuides: plan.pluginGuides,
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
      await this.syncSession(parsed.sessionId, true);
      const source = await this.requireSession(parsed.sessionId);
      const messages = await this.store.listMessages(source.id);
      const index = messages.findIndex(
        (message) => message.id === parsed.messageId && message.role === 'assistant',
      );
      const assistant = messages[index];
      const user = messages[index - 1];
      if (!assistant || user?.role !== 'user' || user.turnId !== assistant.turnId)
        fail('MESSAGE_NOT_FOUND', 'The original question is unavailable.');
      if (assistant.status === 'pending' || assistant.status === 'streaming')
        fail('SESSION_BUSY', 'The answer has not settled.');
      const snapshot =
        assistant.inferenceSnapshot?.status === 'supported'
          ? assistant.inferenceSnapshot.snapshot
          : undefined;
      const choices = {
        parts: userInput(user.parts),
        ...(assistant.modelId ? { modelId: assistant.modelId } : {}),
        ...submittedEffort(snapshot?.reasoningEffort),
        ...(snapshot?.imageGeneration ? { imageGeneration: snapshot.imageGeneration } : {}),
      };
      // A successful answer stays in its source; regeneration uses an independent Cherry copy.
      if (assistant.status === 'success' || index !== messages.length - 1) {
        const before = messages[index - 2];
        if (!before)
          return this.startSession({
            ...choices,
            sessionId: uuidv7(),
            userMessageId: uuidv7(),
            assistantMessageId: uuidv7(),
            agentId: source.agentId,
          });
        const fork = await this.copySession({ sessionId: source.id, fromMessageId: before.id });
        await this.submitMessage({
          ...choices,
          sessionId: fork.id,
          userMessageId: uuidv7(),
          assistantMessageId: uuidv7(),
        });
        return this.requireSession(fork.id);
      }
      // Failed latest answers keep their message identities. Rebuild before retrying so the old
      // execution can never write into the replacement reservation.
      const input = {
        ...choices,
        sessionId: source.id,
        userMessageId: user.id,
        assistantMessageId: assistant.id,
      };
      const plan = await prepareTurn(this.preparation, input, signal, assistant.id);
      plan.history = plan.history.filter((message) => message.turnId !== assistant.turnId);
      if (plan.runtimeContextCheckpoint?.anchorTurnId === assistant.turnId) {
        plan.runtimeContextCheckpoint = null;
        plan.history = messages.filter((message) => message.turnId !== assistant.turnId);
      }
      plan.hasMessages = plan.history.length > 0 || plan.runtimeContextCheckpoint !== null;
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
        ...input,
        userParts: plan.userParts,
        assistantParts: retained,
        modelId: plan.inferenceSnapshot.model.uniqueModelId,
        inferenceSnapshot: plan.inferenceSnapshot,
      });
      try {
        await this.detachConversation(source.id);
        await this.submitPrepared(input, plan, signal, reserved);
      } catch (error) {
        await this.reconcileUnsettled(source.id);
        throw error;
      }
    });
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
      if (await this.conversations.hasConversation(sessionId))
        await this.conversations.abort(sessionId);
      await this.live.get(sessionId)?.unsubscribe();
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

  private async detachConversation(sessionId: string) {
    const state = this.live.get(sessionId);
    await state?.unsubscribe();
    state?.background?.retire();
    this.live.delete(sessionId);
    if (await this.conversations.hasConversation(sessionId))
      await this.conversations.discardConversation(sessionId);
  }

  async cancelTurn(input: Parameters<AgentProtocol['cancelTurn']>[0]) {
    const parsed = AgentCancelTurnInputSchema.parse(input);
    if (!(await this.isCurrentConversation(parsed.sessionId))) return;
    const state = await this.attach(parsed.sessionId);
    if (state.active?.identity.turnId !== parsed.turnId) {
      const queued = state.queue.find((turn) => turn.identity.turnId === parsed.turnId);
      if (queued) await this.conversations.withdraw(parsed.sessionId, queued.identity.requestId);
      return;
    }
    this.publish(parsed.sessionId, {
      type: 'turn.updated',
      turn: { ...projectDurableHostTurn(state.active).turn, status: 'cancelling' },
    });
    await this.conversations.abort(parsed.sessionId);
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
    const state = this.live.get(parsed.sessionId);
    const pending = state?.approvals.get(parsed.approvalId);
    if (state?.active?.identity.turnId !== parsed.turnId || pending?.view.status !== 'pending')
      fail('APPROVAL_NOT_FOUND', 'The approval is no longer pending.');
    pending.resolve(parsed.decision);
  }

  async respondQuestion(input: Parameters<AgentProtocol['respondQuestion']>[0]) {
    const parsed = AgentRespondQuestionSchema.parse(input);
    const state = this.live.get(parsed.sessionId);
    if (
      state?.active?.identity.turnId !== parsed.turnId ||
      state.question?.toolCallId !== parsed.toolCallId
    )
      fail('QUESTION_NOT_FOUND', 'The question is no longer pending.');
    state.questions.respond(parsed.toolCallId, parsed.answer);
  }

  async observeSession(
    sessionId: string,
    listener: (event: AgentEvent) => void,
  ): Promise<AgentSessionObservation> {
    const session = await this.requireSession(sessionId);
    const agent = await this.ports.agents.getAgent(session.agentId);
    if (!agent) fail('AGENT_NOT_FOUND', 'The agent no longer exists.');
    const state =
      this.accepting && (await this.isCurrentConversation(sessionId))
        ? await this.attach(sessionId)
        : undefined;
    await this.requireSession(sessionId);
    const view = state?.active ? projectDurableHostTurn(state.active) : undefined;
    const snapshot = AgentSessionSnapshotSchema.parse({
      agent: { id: agent.id, name: agent.name },
      session,
      capabilities: this.conversations.descriptor.capabilities,
      activeTurn: view ? this.turnStatus(view.turn, state!) : null,
      activeUserMessage: view?.user ?? null,
      streamingMessage: view?.assistant ?? null,
      hasHistoryBeforeActiveTurn: state?.active
        ? DurableTurnMetadataSchema.parse(state.active.metadata).hasHistoryBeforeActiveTurn
        : null,
      pendingQuestion: state?.question ?? null,
      pendingApprovals: [...(state?.approvals.values() ?? [])].map((entry) => entry.view),
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
      documentParserMode: () => this.ports.documentParserMode(),
      files: this.ports.files,
      inferenceModel: this.ports.inferenceModel,
      imageGeneration: this.ports.imageGeneration,
      runtime: this.runtime,
      runtimeTools: this.ports.runtimeTools,
      store: this.store,
      systemCapabilities: this.ports.tools,
    };
  }

  private async prepareExecution(
    identity: RuntimeExecutionIdentity,
    signal: AbortSignal,
  ): Promise<PreparedInput> {
    const key = executionKey(identity.sessionId, identity.requestId);
    const cached = this.prepared.get(key);
    if (cached) return cached;
    const existing = this.preparing.get(key);
    if (existing) return raceAbort(existing, signal);
    const operation = (async () => {
      const state = await this.attach(identity.sessionId);
      const turn =
        state.active?.identity.requestId === identity.requestId
          ? state.active
          : (
              await this.conversations.history(identity.sessionId, {
                limit: 1,
                requestIds: [identity.requestId],
              })
            ).turns[0];
      if (!turn || turn.identity.turnId !== identity.turnId)
        throw new Error('The durable tool has no current owning input.');
      const facts = DurableTurnMetadataSchema.parse(turn.metadata);
      const configuration = await this.conversations.configuration(identity.sessionId);
      const plan = await prepareDurableTurn(
        this.preparation,
        {
          sessionId: identity.sessionId,
          userMessageId: turn.userMessageId,
          assistantMessageId: turn.assistantMessageId,
          parts: userInput(facts.userParts),
          modelId: facts.inferenceSnapshot.model.uniqueModelId,
          ...submittedEffort(configuration.options.reasoningEffort),
          ...(facts.inferenceSnapshot.imageGeneration
            ? { imageGeneration: facts.inferenceSnapshot.imageGeneration }
            : {}),
        },
        await this.conversations.resourceFileEntryIds(identity.sessionId),
        signal,
      );
      plan.usageAttribution.bindMessage({ id: turn.assistantMessageId, kind: 'agent-session' });
      for (const part of turn.parts)
        if (part.type === 'file')
          plan.resources.grantFile(FileEntryIdSchema.parse(part.ref.fileEntryId));
      const prepared = { turnId: identity.turnId, plan };
      this.prepared.set(key, prepared);
      return prepared;
    })();
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
          {
            agentId: plan.agent.id,
            sessionId: identity.sessionId,
            turnId: identity.turnId,
          },
          { 'tool.name': tool.providerName },
        );
        try {
          const output = await tool.execute(call);
          span?.end(output.failure ? 'error' : 'ok');
          return output;
        } catch (error) {
          span?.end(call.signal.aborted ? 'cancelled' : 'error');
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
    const state = await this.attach(identity.sessionId);
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
    const key = executionKey(identity.sessionId, identity.requestId);
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
    const entry = [...this.live.entries()].find(
      ([, state]) => state.active?.identity.turnId === call.turnId,
    );
    if (!entry) throw new Error('The question has no active owning input.');
    const [sessionId, state] = entry;
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

  private async isCurrentConversation(sessionId: string) {
    const revision = await this.store.getRuntimeRevision(sessionId);
    return revision !== null && revision === (await this.conversations.revision(sessionId));
  }

  private async syncSession(sessionId: string, requireIdle = false) {
    await this.settlements.get(sessionId);
    if (
      (await this.conversations.hasConversation(sessionId)) &&
      !(await this.isCurrentConversation(sessionId))
    )
      await this.detachConversation(sessionId);
    await this.reconcileUnsettled(sessionId);
    // Observation may lag native admission. Durable reservations also guard history mutations.
    if (
      requireIdle &&
      (await this.store.listUnsettledAssistantMessages()).some((row) => row.sessionId === sessionId)
    )
      fail('SESSION_BUSY', 'The session has unfinished work.');
  }

  /** Each unsettled Cherry row is a durable receipt awaiting its full Pi result, with no cursor gaps. */
  private async reconcileUnsettled(onlySessionId?: string) {
    const rows = await this.store.listUnsettledAssistantMessages();
    for (const row of rows) {
      if (onlySessionId && row.sessionId !== onlySessionId) continue;
      const selected = (await this.isCurrentConversation(row.sessionId))
        ? await this.conversations.message(row.sessionId, row.assistantMessageId)
        : undefined;
      if (selected?.turn.identity.turnId === row.turnId) {
        if (selected.turn.status !== 'running' && selected.turn.status !== 'queued') {
          const turn = this.timed(selected.turn);
          await this.persistTurn(turn);
          if (this.live.has(row.sessionId)) this.presentSettled(turn);
        }
        continue;
      }
      // Reservation committed, but admission did not. Preserve any recorded output as interrupted.
      const message = (await this.store.listMessages(row.sessionId)).find(
        (item) => item.id === row.assistantMessageId,
      );
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
    }
  }

  /** Called with admission blocked and no native work, including background compaction. */
  private async captureCheckpoints() {
    for (const { sessionId } of await this.conversations.sessions()) {
      if (!(await this.isCurrentConversation(sessionId))) continue;
      const latest = (await this.conversations.history(sessionId, { limit: 1 })).turns[0];
      if (latest?.status !== 'completed') continue;
      const { contextCheckpoint } = await this.conversations.exportTurn(
        sessionId,
        latest.identity.requestId,
        { currentContext: true },
      );
      if (contextCheckpoint)
        await this.store.saveContextCheckpoint(
          latest.assistantMessageId,
          latest.identity.turnId,
          contextCheckpoint,
        );
    }
  }

  private async persistTurn(turn: RuntimeDurableTurn) {
    const { assistant, turn: view } = projectDurableHostTurn(turn);
    if (!assistant || turn.status === 'running' || turn.status === 'queued') return;
    const artifacts = await this.conversations.exportTurn(
      turn.identity.sessionId,
      turn.identity.requestId,
    );
    const timing = durableRuntimeTiming(turn) ?? { startedAt: turn.createdAt, spans: [] };
    await this.store.finalizeAssistantMessage({
      assistantMessageId: assistant.id,
      turnId: turn.identity.turnId,
      status:
        turn.status === 'completed' ? 'success' : turn.status === 'failed' ? 'error' : turn.status,
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
  }

  private settle(turn: RuntimeDurableTurn) {
    const sessionId = turn.identity.sessionId;
    const operation = (this.settlements.get(sessionId) ?? Promise.resolve())
      .then(async () => {
        await this.persistTurn(turn);
        this.presentSettled(turn);
      })
      .catch((error: unknown) => {
        logger.warn(
          'Agent result remains in Pi until Cherry settlement can be retried',
          error as Error,
        );
      });
    this.settlements.set(sessionId, operation);
    this.pendingWrites.add(operation);
    void operation.finally(() => {
      this.pendingWrites.delete(operation);
      if (this.settlements.get(sessionId) === operation) this.settlements.delete(sessionId);
    });
  }

  private async attach(sessionId: string): Promise<LiveSession> {
    const existing = this.live.get(sessionId);
    if (existing) return existing;
    const pending = this.attachments.get(sessionId);
    if (pending) return pending;
    const operation = (async () => {
      const state: LiveSession = {
        waiters: new Set(),
        users: new Set(),
        assistant: null,
        active: null,
        queue: [],
        unsubscribe: async () => {},
        background: null,
        backgroundRequestId: null,
        question: null,
        questions: new TurnUserQuestions(),
        approvals: new Map(),
      };
      // The engine's exact watch is acquired before scheduling. App route listeners are independent.
      let installed = false;
      const pending: RuntimeConversationEvent[] = [];
      const observed = await this.conversations.observe(sessionId, (event) => {
        if (installed) this.consume(sessionId, state, event);
        else pending.push(event);
      });
      state.active = observed.snapshot.activeTurn && this.timed(observed.snapshot.activeTurn);
      state.queue = observed.snapshot.queue;
      state.unsubscribe = observed.unsubscribe;
      this.live.set(sessionId, state);
      if (state.active) this.present(state.active);
      installed = true;
      for (const event of pending) this.consume(sessionId, state, event);
      return state;
    })();
    this.attachments.set(sessionId, operation);
    try {
      return await operation;
    } finally {
      this.attachments.delete(sessionId);
    }
  }

  private consume(sessionId: string, state: LiveSession, event: RuntimeConversationEvent) {
    if (event.type === 'snapshot') {
      state.active = event.snapshot.activeTurn && this.timed(event.snapshot.activeTurn);
      state.queue = event.snapshot.queue;
      if (state.active) this.present(state.active);
    } else if (event.type === 'queue.updated') {
      state.queue = event.queue;
      for (const turn of event.queue) this.publishRows(turn);
    } else {
      const turn = this.timed(event.turn);
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
    const approvals = this.approvalWaits.get(
      executionKey(turn.identity.sessionId, turn.identity.requestId),
    );
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
    const sessionId = turn.identity.sessionId;
    const state = this.live.get(sessionId);
    this.publishRows(turn);
    if (turn.status === 'queued') return;
    const view = projectDurableHostTurn(turn);
    const projected = state ? this.turnStatus(view.turn, state) : view.turn;
    const terminal = turn.status !== 'running';
    // Cherry settlement can finish after Pi has already started the next queued input.
    if (
      !terminal ||
      !state?.active ||
      state.active.identity.requestId === turn.identity.requestId
    ) {
      this.publish(sessionId, { type: 'turn.updated', turn: projected });
      this.setStatus(sessionId, { turnId: projected.id, status: projected.status });
    }
    if (!terminal) {
      if (state?.background && state.backgroundRequestId !== turn.identity.requestId) {
        state.background.retire();
        state.background = null;
        state.backgroundRequestId = null;
      }
      if (state && !state.background)
        this.track(
          (async () => {
            const session = await this.store.getSession(sessionId);
            const prepared = this.prepared.get(executionKey(sessionId, turn.identity.requestId));
            const agent =
              prepared?.plan.agent ??
              (session ? await this.ports.agents.getAgent(session.agentId) : null);
            if (
              !agent ||
              state.background ||
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
            if (view.assistant) state.background.update(view.assistant);
          })(),
        );
      if (view.assistant) state?.background?.update(view.assistant);
    } else {
      if (state?.backgroundRequestId === turn.identity.requestId) {
        state.background?.finish(
          turn.status === 'completed'
            ? 'completed'
            : turn.status === 'cancelled'
              ? 'cancelled'
              : 'failed',
        );
        state.background = null;
        state.backgroundRequestId = null;
      }
      const prepared = this.prepared.get(executionKey(sessionId, turn.identity.requestId));
      this.prepared.delete(executionKey(sessionId, turn.identity.requestId));
      this.approvalWaits.delete(executionKey(sessionId, turn.identity.requestId));
      if (turn.status === 'completed' && prepared && !prepared.plan.hasMessages && view.assistant)
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

  private publishRows(turn: RuntimeDurableTurn) {
    const { user, assistant } = projectDurableHostTurn(turn);
    const sessionId = turn.identity.sessionId;
    const state = this.live.get(sessionId);
    if (!state?.users.has(user.id)) {
      state?.users.add(user.id);
      this.publish(sessionId, { type: 'message.created', message: user });
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
    const turn = this.turnStatus(projectDurableHostTurn(state.active).turn, state);
    this.publish(sessionId, { type: 'turn.updated', turn });
    this.setStatus(sessionId, { turnId: turn.id, status: turn.status });
  }

  private async waitForOwner(sessionId: string, requestId: string, signal: AbortSignal) {
    const state = await this.attach(sessionId);
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
        logger.warn('Agent listener failed', error as Error);
      }
  }
  private setStatus(sessionId: string, status: AgentSessionStatus | null) {
    const previous = this.statuses.get(sessionId);
    if (previous?.turnId === status?.turnId && previous?.status === status?.status) return;
    if (status) this.statuses.set(sessionId, Object.freeze(status));
    else this.statuses.delete(sessionId);
    for (const listener of this.statusListeners.get(sessionId) ?? [])
      try {
        listener();
      } catch (error) {
        logger.warn('Agent status listener failed', error as Error);
      }
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
      logger.warn('Agent projection failed', error as Error),
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
      this.live.get(sessionId)?.active ||
      this.live.get(sessionId)?.queue.length ||
      this.settlements.has(sessionId)
    )
      fail('SESSION_BUSY', 'The session has unfinished work.');
  }
  private admit<Result>(
    sessionId: string,
    operation: (signal: AbortSignal) => Promise<Result>,
  ): Promise<Result> {
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
      .then(() => operation(controller.signal))
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
function executionKey(sessionId: string, requestId: string) {
  return `${sessionId}:${requestId}`;
}

function configurationKey(configuration: RuntimeConversationSeed['configuration']) {
  const facts = {
    kind: configuration.kind ?? 'language',
    model: configuration.model,
    instructions: configuration.instructions,
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
    })),
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
function userInput(parts: AgentMessageView['parts']): AgentInputPart[] {
  return parts.flatMap((part) => {
    if (part.type === 'text')
      return [
        AgentInputPartSchema.parse({
          type: part.type,
          text: part.text,
          ...(part.pluginReferences ? { pluginReferences: part.pluginReferences } : {}),
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
