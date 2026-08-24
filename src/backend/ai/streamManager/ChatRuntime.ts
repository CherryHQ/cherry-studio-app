import {
  applyStreamingMessage,
  dropEmptyContentParts,
  finalizeInterruptedParts,
  finalizeTurnToolApprovals,
  hasPendingToolApproval,
  hasUnresumedToolApproval,
  MessageRuntimeTimingCollector,
  withIdleTimeout,
  wrapSteerReminder,
} from '@cherrystudio/ai-runtime/runtime';
import { serializeError } from '@cherrystudio/ai-runtime/utils';
import type {
  TopicStatusSnapshotEntry,
  TopicStreamStatus,
} from '@cherrystudio/universal/ai/transport';
import {
  buildFirstUserMessageTitle,
  sanitizeConversationTitle,
} from '@cherrystudio/universal/utils/conversationTitle';
import { isToolUIPart, readUIMessageStream, type UIMessageChunk } from 'ai';

import type { AiService } from '@/backend/ai/AiService';
import { application } from '@/backend/core/application/Application';
import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { OperationHandle } from '@/backend/core/resources/types';
import { assistantService } from '@/backend/data/services/AssistantService';
import { fileEntryService } from '@/backend/data/services/FileEntryService';
import { messageService } from '@/backend/data/services/MessageService';
import { modelService } from '@/backend/data/services/ModelService';
import { providerService } from '@/backend/data/services/ProviderService';
import { topicService } from '@/backend/data/services/TopicService';
import type {
  BackgroundReplyLifecycle,
  BackgroundReplyTurn,
} from '@/backend/services/backgroundReply';
import { createMessageParts, discardInternalEntries } from '@/backend/services/file/fileStorage';
import type {
  ChatCancelExecutionInput,
  ChatEditAndResendInput,
  ChatFollowUpInput,
  ChatRegenerateInput,
  ChatSendMultiModelTextInput,
  ChatSendNewTopicMultiModelTextInput,
  ChatSendNewTopicTextInput,
  ChatSendTextInput,
  ChatSetActiveBranchInput,
  ChatListener,
  ChatModule,
  ChatTopicSnapshot,
  ChatToolApprovalInput,
} from '@/shared/contracts';
import { NEW_TOPIC_SNAPSHOT_KEY } from '@/shared/contracts';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { PreferenceKeyType } from '@/shared/data/preference';
import type { FileEntry } from '@/shared/data/types/file';
import type {
  CherryMessagePart,
  CherryUIMessage,
  Message,
  MessageData,
  MessageRuntimeStatsInput,
  MessageSnapshot,
  ModelSnapshot,
} from '@/shared/data/types/message';
import type { Model, UniqueModelId } from '@/shared/data/types/model';
import { isUniqueModelId } from '@/shared/data/types/model';
import type { Topic } from '@/shared/data/types/topic';

import type { ChatRuntimeDependencies, ChatRuntimeServices } from './ChatRuntimeDependencies';
import { extractMainText, maybeRenameTopicFromConversationSummary } from './topicNaming';

type ActiveExecution = {
  abortController: AbortController;
  assistantMessage: Message;
  model: Model;
  pendingApprovalToolCallIds: Set<string>;
  status: 'aborted' | 'done' | 'error' | 'streaming';
};

type ActiveTurn = {
  abortController: AbortController;
  backgroundReply?: BackgroundReplyTurn;
  backgroundReplyModelId?: UniqueModelId;
  executions: Map<UniqueModelId, ActiveExecution>;
  hasHistoryBeforePendingTurn?: boolean;
  overlays: Map<UniqueModelId, Message>;
  pendingUserMessage?: Message;
  lastCompletedAt?: number;
  streamStatus: TopicStreamStatus;
  turnId: string;
};

type PendingSteer = {
  fastMode: boolean;
  reasoningEffort?: ChatSendTextInput['reasoningEffort'];
  userMessageId: string;
};

/** Scope registrations held for one task, released together when it settles. */
type TaskScopeBinding = {
  handles: OperationHandle[];
  settled: Promise<void>;
};

const idleTopicSnapshot: ChatTopicSnapshot = Object.freeze({ status: 'idle' });
const logger = loggerService.withContext('ChatRuntime');

/**
 * Fed back to the model as tool results (via `convertToModelMessages`), never
 * shown in the UI — fixed English text, no i18n.
 */
const interruptedTurnApprovalReason = 'The turn ended before this tool call completed.';

export type ChatRuntimeConfig = {
  approvalIdleTimeoutMs: number;
  idleTimeoutMs: number;
};

const defaultChatRuntimeConfig: ChatRuntimeConfig = {
  approvalIdleTimeoutMs: 2 * 60 * 60 * 1000,
  idleTimeoutMs: 30 * 60 * 1000,
};

/**
 * Everything a turn touches, bound to the installed host.
 *
 * Only `preference` is resolved per call: the rest are module singletons that
 * reach the current host themselves, and `AiService` arrives through
 * `@DependsOn`, so capturing it cannot outlive the generation that injected it.
 */
function createHostDependencies(
  aiService: AiService,
  backgroundReply: BackgroundReplyLifecycle,
): ChatRuntimeDependencies {
  const preference: ChatRuntimeServices['preference'] = {
    get: <K extends PreferenceKeyType>(key: K) => application.get('PreferenceService').get(key),
  };

  return {
    backgroundReply,
    files: {
      createParts: (parts) => createMessageParts(fileEntryService, parts),
      discard: (entries) => discardInternalEntries(fileEntryService, entries),
    },
    services: {
      ai: {
        generateText: (input) => aiService.generateText(input),
        // The accumulator is the SDK's, not the service's — it turns the chunk
        // stream the service returns into successive message snapshots.
        readMessageStream: ({ message, stream }) =>
          readUIMessageStream<CherryUIMessage>({ message, stream, terminateOnError: true }),
        streamText: (input) => aiService.streamText(input),
      },
      assistant: assistantService,
      message: messageService,
      model: modelService,
      preference,
      provider: providerService,
      topic: topicService,
    },
  };
}

/**
 * Owns every in-flight chat turn: reservation, streaming, terminal persistence,
 * and the snapshots the chat screen renders from.
 *
 * `PostReady` rather than `Gate`: no first paint reads a turn, and hoisting it
 * would drag `AiService` onto the gate with it. Construction still happens at
 * composition time, so the service exists long before a user can send anything;
 * only its (empty) initialization waits for the gate to open.
 *
 * It declares `AiService` and takes it positionally, unlike `AiService` itself,
 * because `onStop` is what aborts live turns: reverse-order teardown has to stop
 * this service before the one it streams through, and only a declared edge
 * orders that. The cost is one placeholder argument in the suite, which replaces
 * the whole dependency set anyway.
 */
@Injectable('ChatRuntime')
@ServicePhase(Phase.PostReady)
@DependsOn(['AiService', 'BackgroundReplyRuntime'])
@AppStatePolicy('continue')
export class ChatRuntime extends BaseService implements ChatModule {
  private activeTasks = new Set<Promise<unknown>>();
  private activeTurns = new Map<string, ActiveTurn>();
  private continuingTopics = new Set<string>();
  private isDisposed = false;
  private listeners = new Set<ChatListener>();
  private newTopicHandoffTopicId: string | undefined;
  private pendingSteers = new Map<string, PendingSteer[]>();
  private followUpQueues = new Map<string, ChatFollowUpInput['payload'][]>();
  private topicSnapshots = new Map<string, ChatTopicSnapshot>();

  /**
   * The scope binding of the new-topic task currently between "send" and "topic
   * created", so the handoff can extend it to the real id.
   *
   * Single-valued for the same reason `newTopicHandoffTopicId` is: the sentinel
   * key admits one new-topic flow at a time.
   */
  private newTopicScopeBinding: TaskScopeBinding | undefined;

  private readonly config: ChatRuntimeConfig;
  private readonly dependencies: ChatRuntimeDependencies;

  /**
   * Resolved per call so no task pins a host generation. Not a declared
   * dependency: the coordinator is `Gate` and this is `PostReady`, so it is
   * always ready before a turn can start, and shutdown deliberately routes
   * around it — `onStop` drains this runtime's own tasks.
   */
  private get scopes() {
    return application.get('ResourceScopeCoordinator');
  }

  /**
   * The container passes the two declared dependencies. Tests replace the
   * complete port set, so neither production dependency is read there.
   */
  constructor(
    aiService: AiService,
    backgroundReply: BackgroundReplyLifecycle,
    dependencies?: ChatRuntimeDependencies,
    config: Partial<ChatRuntimeConfig> = {},
  ) {
    super();
    this.dependencies = dependencies ?? createHostDependencies(aiService, backgroundReply);
    this.config = { ...defaultChatRuntimeConfig, ...config };
  }

  subscribe = (listener: ChatListener) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  getTopicSnapshot(topicId: string): ChatTopicSnapshot {
    const runtimeTopicId = this.resolveRuntimeTopicId(topicId);

    if (runtimeTopicId !== topicId) {
      return this.topicSnapshots.get(runtimeTopicId) ?? idleTopicSnapshot;
    }

    return this.topicSnapshots.get(topicId) ?? idleTopicSnapshot;
  }

  abort(topicId: string): void {
    const runtimeTopicId = this.resolveRuntimeTopicId(topicId);
    const activeTurn = this.activeTurns.get(runtimeTopicId);

    if (!activeTurn) {
      return;
    }

    const reason = new Error('Chat stream aborted');
    activeTurn.abortController.abort(reason);
    for (const execution of activeTurn.executions.values()) {
      if (execution.status === 'streaming') {
        execution.status = 'aborted';
        execution.abortController.abort(reason);
      }
    }
    activeTurn.streamStatus = 'aborted';
    this.setTurnSnapshot(runtimeTopicId, {
      ...this.getTopicSnapshot(runtimeTopicId),
      status: 'aborting',
      stream: buildStreamStatusSnapshot(activeTurn),
    });
  }

  cancelExecution(input: ChatCancelExecutionInput): void {
    const activeTurn = this.activeTurns.get(this.resolveRuntimeTopicId(input.topicId));
    const execution = activeTurn?.executions.get(input.executionId);
    if (!execution || execution.status !== 'streaming') {
      return;
    }

    execution.status = 'aborted';
    execution.abortController.abort(new Error('Chat execution aborted'));
  }

  sendText(input: ChatSendTextInput): Promise<void> {
    return this.startTask(input.topicId, () => this.sendTextTask(input));
  }

  sendMultiModelText(input: ChatSendMultiModelTextInput): Promise<void> {
    return this.startTask(input.topicId, () => this.sendMultiModelTextTask(input));
  }

  steer(input: ChatFollowUpInput): Promise<void> {
    return this.startTask(input.topicId, () => this.steerTask(input));
  }

  queueFollowUp(input: ChatFollowUpInput): Promise<void> {
    return this.startTask(input.topicId, () => this.queueFollowUpTask(input));
  }

  regenerate(input: ChatRegenerateInput): Promise<void> {
    return this.startTask(input.topicId, () => this.regenerateTask(input));
  }

  editAndResend(input: ChatEditAndResendInput): Promise<void> {
    return this.startTask(input.topicId, () => this.editAndResendTask(input));
  }

  setActiveBranch(input: ChatSetActiveBranchInput): Promise<void> {
    return this.startTask(input.topicId, () => this.setActiveBranchTask(input));
  }

  sendNewTopicText(input: ChatSendNewTopicTextInput): Promise<void> {
    return this.startTask(NEW_TOPIC_SNAPSHOT_KEY, () => this.sendNewTopicTextTask(input));
  }

  sendNewTopicMultiModelText(input: ChatSendNewTopicMultiModelTextInput): Promise<void> {
    return this.startTask(NEW_TOPIC_SNAPSHOT_KEY, () => this.sendNewTopicMultiModelTextTask(input));
  }

  respondToolApproval(input: ChatToolApprovalInput): Promise<void> {
    return this.startTask(input.topicId, () => this.respondToolApprovalTask(input));
  }

  /**
   * Abort every live turn, then wait for the tasks settling their rows.
   *
   * The flag is set before the first await so a send racing teardown is refused
   * rather than reserving a row nothing will ever finish. The wait is unbounded
   * on purpose: every task here honors its abort signal, so the only thing left
   * to finish is the terminal write, and giving up on that would strand the row
   * `pending`.
   */
  protected async onStop(): Promise<void> {
    this.isDisposed = true;

    for (const activeTurn of this.activeTurns.values()) {
      const reason = new Error('Chat runtime disposed');
      activeTurn.abortController.abort(reason);
      for (const execution of activeTurn.executions.values()) {
        execution.abortController.abort(reason);
      }
    }
    await Promise.allSettled([...this.activeTasks]);
    this.activeTasks.clear();
    this.activeTurns.clear();
    this.continuingTopics.clear();
    this.followUpQueues.clear();
    this.newTopicHandoffTopicId = undefined;
    this.pendingSteers.clear();
    this.topicSnapshots.clear();
    this.listeners.clear();
  }

  private async sendTextTask(input: ChatSendTextInput): Promise<void> {
    const text = input.text.trim();
    const parts = getTurnParts({ parts: input.parts, text });

    if (parts.length === 0) {
      return;
    }

    if (this.isTopicBusy(input.topicId)) {
      throw new Error('A response is already streaming for this topic.');
    }

    const activeTurn = createActiveTurn();
    const { abortController } = activeTurn;
    this.activateTurn(input.topicId, activeTurn);
    this.setTopicSnapshot(input.topicId, { status: 'reserving' });

    try {
      const { model, topic } = await this.resolveTurnContext(input);
      throwIfAborted(abortController.signal);

      await this.runTopicTurn({
        activeTurn,
        fastMode: input.fastMode,
        models: [model],
        parts,
        reasoningEffort: input.reasoningEffort,
        topic,
      });
    } catch (error) {
      this.activeTurns.delete(input.topicId);
      await this.invalidateTopicMessagesSafely(input.topicId);
      this.setTopicSnapshot(input.topicId, idleTopicSnapshot);

      if (!abortController.signal.aborted) {
        logger.warn('Chat stream failed before reservation', toError(error));
        throw toError(error);
      }
    }
  }

  private async steerTask(input: ChatFollowUpInput): Promise<void> {
    if (!this.isTopicBusy(input.topicId)) {
      await this.sendFollowUpPayloadTask(input.topicId, input.payload);
      return;
    }

    const parts = getFollowUpParts(input.payload);
    if (parts.length === 0) {
      return;
    }

    let entriesCommitted = false;
    let createdEntries: FileEntry[] = [];
    try {
      const topic = await this.dependencies.services.topic.getById(input.topicId);
      const modelId =
        input.payload.mentionedModels?.[0] ?? (await this.resolveModelId(undefined, topic));
      const managed = await this.dependencies.files.createParts(parts);
      createdEntries = managed.entries;
      const reserved = await this.dependencies.services.message.createUserMessageWithPlaceholders({
        placeholders: [],
        topicId: input.topicId,
        userMessage: {
          mode: 'create',
          dto: {
            data: { parts: managed.parts },
            modelId,
            parentId: topic.activeNodeId ?? null,
            role: 'user',
            status: 'success',
          },
        },
      });
      entriesCommitted = true;
      this.appendPendingSteer(input.topicId, {
        fastMode: input.payload.fastMode === true,
        reasoningEffort: input.payload.reasoningEffort,
        userMessageId: reserved.userMessage.id,
      });
      await this.emitAndWait({ topicId: input.topicId, type: 'invalidate-topic-messages' });

      if (!this.activeTurns.has(input.topicId) && !this.continuingTopics.has(input.topicId)) {
        await this.startNextPendingTurn(input.topicId);
      }
    } finally {
      if (!entriesCommitted) {
        await this.dependencies.files.discard(createdEntries);
      }
    }
  }

  private async queueFollowUpTask(input: ChatFollowUpInput): Promise<void> {
    if (!this.isTopicBusy(input.topicId)) {
      await this.sendFollowUpPayloadTask(input.topicId, input.payload);
      return;
    }

    const queue = this.followUpQueues.get(input.topicId);
    if (queue) {
      queue.push(input.payload);
    } else {
      this.followUpQueues.set(input.topicId, [input.payload]);
    }
    this.publishQueuedMessages(input.topicId);
  }

  private async sendFollowUpPayloadTask(
    topicId: string,
    payload: ChatFollowUpInput['payload'],
  ): Promise<void> {
    const modelIds = uniqueModelIds(payload.mentionedModels ?? []);
    const input = {
      fastMode: payload.fastMode,
      parts: payload.userMessageParts,
      reasoningEffort: payload.reasoningEffort,
      text: payload.text,
      topicId,
    };
    if (modelIds.length > 1) {
      await this.sendMultiModelTextTask({ ...input, selectedModelIds: modelIds });
      return;
    }

    await this.sendTextTask({ ...input, selectedModelId: modelIds[0] });
  }

  private async sendMultiModelTextTask(input: ChatSendMultiModelTextInput): Promise<void> {
    const text = input.text.trim();
    const parts = getTurnParts({ parts: input.parts, text });

    if (parts.length === 0) {
      return;
    }
    if (input.selectedModelIds.length < 2) {
      throw new Error('Multi-model sends require at least two models.');
    }
    if (this.isTopicBusy(input.topicId)) {
      throw new Error('A response is already streaming for this topic.');
    }

    const activeTurn = createActiveTurn();
    this.activateTurn(input.topicId, activeTurn);
    this.setTopicSnapshot(input.topicId, { status: 'reserving' });

    try {
      const topic = await this.resolveTopicForTurn(input);
      const models = await this.resolveModels(input.selectedModelIds, topic);
      throwIfAborted(activeTurn.abortController.signal);

      await this.runTopicTurn({
        activeTurn,
        fastMode: input.fastMode,
        models,
        parts,
        reasoningEffort: input.reasoningEffort,
        siblingsGroupId: nextSiblingsGroupId(),
        topic,
      });
    } catch (error) {
      this.activeTurns.delete(input.topicId);
      await this.invalidateTopicMessagesSafely(input.topicId);
      this.setTopicSnapshot(input.topicId, idleTopicSnapshot);

      if (!activeTurn.abortController.signal.aborted) {
        logger.warn('Multi-model chat stream failed before reservation', toError(error));
        throw toError(error);
      }
    }
  }

  private async regenerateTask(input: ChatRegenerateInput): Promise<void> {
    if (this.isTopicBusy(input.topicId)) {
      throw new Error('A response is already streaming for this topic.');
    }

    const activeTurn = createActiveTurn();
    this.activateTurn(input.topicId, activeTurn);
    this.setTopicSnapshot(input.topicId, { status: 'reserving' });

    try {
      const topic = await this.dependencies.services.topic.getById(input.topicId);
      const target = await this.dependencies.services.message.getById(input.messageId);
      assertMessageBelongsToTopic(target, topic.id);
      const userMessage = await this.resolveRegenerateUserMessage(target);
      assertMessageBelongsToTopic(userMessage, topic.id);
      const children = await this.dependencies.services.message.getChildrenByParentId(
        userMessage.id,
      );
      const inheritedAssistant =
        target.role === 'assistant'
          ? target
          : await this.resolveActiveAssistantChild(topic, children);
      const selectedModelIds =
        input.selectedModelIds?.length || !inheritedAssistant?.modelId
          ? input.selectedModelIds
          : [inheritedAssistant.modelId as UniqueModelId];
      const models = await this.resolveModels(selectedModelIds, topic);
      const siblingsGroupId = await this.resolveAssistantSiblingsGroupId({
        isRegenerate: true,
        models,
        userMessageId: userMessage.id,
      });
      throwIfAborted(activeTurn.abortController.signal);

      await this.runExistingUserTurn({
        activeTurn,
        fastMode: input.fastMode ?? inheritedAssistant?.data.turnOptions?.fastMode,
        models,
        reasoningEffort:
          input.reasoningEffort ?? inheritedAssistant?.data.turnOptions?.reasoningEffort,
        siblingsGroupId,
        topic,
        userMessage,
      });
    } catch (error) {
      this.activeTurns.delete(input.topicId);
      await this.invalidateTopicMessagesSafely(input.topicId);
      this.setTopicSnapshot(input.topicId, idleTopicSnapshot);

      if (!activeTurn.abortController.signal.aborted) {
        logger.warn('Regenerate chat stream failed before reservation', toError(error));
        throw toError(error);
      }
    }
  }

  private async editAndResendTask(input: ChatEditAndResendInput): Promise<void> {
    const text = input.text.trim();
    const parts = getTurnParts({ parts: input.parts, text });
    if (parts.length === 0) {
      return;
    }
    if (this.isTopicBusy(input.topicId)) {
      throw new Error('A response is already streaming for this topic.');
    }

    const activeTurn = createActiveTurn();
    this.activateTurn(input.topicId, activeTurn);
    this.setTopicSnapshot(input.topicId, { status: 'reserving' });

    try {
      const topic = await this.dependencies.services.topic.getById(input.topicId);
      const source = await this.dependencies.services.message.getById(input.messageId);
      assertMessageBelongsToTopic(source, topic.id);
      if (source.role !== 'user') {
        throw new Error('Only user messages can be edited and resent.');
      }
      const children = await this.dependencies.services.message.getChildrenByParentId(source.id);
      const inheritedAssistant = await this.resolveActiveAssistantChild(topic, children);
      const inheritedModelIds = uniqueModelIds(
        children.flatMap((message) =>
          message.role === 'assistant' && message.modelId ? [message.modelId as UniqueModelId] : [],
        ),
      );
      const selectedModelIds =
        input.selectedModelIds?.length ||
        inheritedModelIds.length > 1 ||
        (!topic.assistantId && inheritedModelIds.length === 1)
          ? (input.selectedModelIds ?? inheritedModelIds)
          : undefined;
      const models = await this.resolveModels(selectedModelIds, topic);
      const assistantSiblingsGroupId = await this.resolveAssistantSiblingsGroupId({
        isRegenerate: false,
        models,
        userMessageId: source.id,
      });
      const userSiblingsGroupId = source.siblingsGroupId || nextSiblingsGroupId();
      if (source.siblingsGroupId === 0) {
        await this.dependencies.services.message.updateSiblingsGroupId(
          source.id,
          userSiblingsGroupId,
        );
      }
      throwIfAborted(activeTurn.abortController.signal);

      await this.runTopicTurn({
        activeTurn,
        allowAutoName: false,
        fastMode: input.fastMode ?? inheritedAssistant?.data.turnOptions?.fastMode,
        hasHistoryBeforePendingTurn: true,
        models,
        parentId: source.parentId,
        parts,
        reasoningEffort:
          input.reasoningEffort ?? inheritedAssistant?.data.turnOptions?.reasoningEffort,
        siblingsGroupId: assistantSiblingsGroupId,
        topic,
        userSiblingsGroupId,
      });
    } catch (error) {
      this.activeTurns.delete(input.topicId);
      await this.invalidateTopicMessagesSafely(input.topicId);
      this.setTopicSnapshot(input.topicId, idleTopicSnapshot);

      if (!activeTurn.abortController.signal.aborted) {
        logger.warn('Edit-and-resend chat stream failed before reservation', toError(error));
        throw toError(error);
      }
    }
  }

  private async setActiveBranchTask(input: ChatSetActiveBranchInput): Promise<void> {
    const path = await this.dependencies.services.message.getPathThrough(
      input.topicId,
      input.throughNodeId,
    );
    const leaf = path.at(-1);
    if (!leaf) {
      throw new Error(`Cannot resolve branch through message: ${input.throughNodeId}`);
    }

    await this.dependencies.services.topic.setActiveNode(input.topicId, leaf.id);
    await this.emitAndWait({ topicId: input.topicId, type: 'invalidate-topic-messages' });
    await this.emitAndWait({ type: 'invalidate-topics' });
  }

  private async sendNewTopicTextTask(input: ChatSendNewTopicTextInput): Promise<void> {
    await this.sendNewTopicTurnTask(
      input,
      input.selectedModelId ? [input.selectedModelId] : undefined,
    );
  }

  private async sendNewTopicMultiModelTextTask(
    input: ChatSendNewTopicMultiModelTextInput,
  ): Promise<void> {
    if (input.selectedModelIds.length < 2) {
      throw new Error('Multi-model sends require at least two models.');
    }
    await this.sendNewTopicTurnTask(input, input.selectedModelIds);
  }

  private async sendNewTopicTurnTask(
    input: ChatSendNewTopicTextInput,
    selectedModelIds: readonly UniqueModelId[] | undefined,
  ): Promise<void> {
    const text = input.text.trim();
    const parts = getTurnParts({ parts: input.parts, text });

    if (parts.length === 0) {
      return;
    }

    // The only real conflict is a previous new topic still being reserved — a
    // window of a few hundred ms. `newTopicHandoffTopicId` stays set from topic
    // creation until the stream ends and merely mirrors the created topic's
    // snapshot onto this screen, so treating it as a mutex rejects a legitimate
    // send: the assistant detail screen's "start chat" lets the user open
    // another new topic while the previous reply is still streaming.
    if (this.activeTurns.has(NEW_TOPIC_SNAPSHOT_KEY)) {
      // This rejection surfaces as a bare "message was not sent" toast, so it
      // has to leave a trace of its own.
      logger.warn('Rejected a new-topic send: the previous new topic is still being created');
      throw new Error('A topic is already being created.');
    }

    // Hand the new-topic snapshot slot over to this turn; the previous topic's
    // stream keeps writing to its own id.
    this.newTopicHandoffTopicId = undefined;
    const activeTurn = createActiveTurn();
    const { abortController } = activeTurn;
    this.activateTurn(NEW_TOPIC_SNAPSHOT_KEY, activeTurn);
    this.setTopicSnapshot(NEW_TOPIC_SNAPSHOT_KEY, { status: 'reserving' });

    let createdTopicId: string | undefined;

    try {
      const models = await this.resolveModels(selectedModelIds, {
        assistantId: input.assistantId ?? undefined,
      });
      throwIfAborted(abortController.signal);

      const topicCreateDto = {
        name: createTopicName({ parts, text }),
        ...(input.assistantId ? { assistantId: input.assistantId } : {}),
      };
      const topic = await this.dependencies.services.topic.create(topicCreateDto);
      createdTopicId = topic.id;
      throwIfAborted(abortController.signal);

      this.activeTurns.delete(NEW_TOPIC_SNAPSHOT_KEY);
      this.newTopicHandoffTopicId = topic.id;
      this.bindCreatedTopicScope(topic.id);
      this.activateTurn(topic.id, activeTurn);
      this.setTurnSnapshot(topic.id, { status: 'reserving' });

      await this.runTopicTurn({
        activeTurn,
        fastMode: input.fastMode,
        models,
        // 导航挂在「这一轮已经进快照」之后：目的地一挂载就有用户消息和助手占位可画。
        //
        // 两个通知都用 `emit` 而不是 `emitAndWait`：后者不吞订阅者的异常，一个导航失败会让
        // 整轮走 catch；而话题列表的失效是**一次 refetch**，等它等的是一份此刻没人在看的
        // 数据——放在导航之前 await，用户就得多盯几百毫秒的空界面。
        onTurnPublished: () => {
          this.emit({ topicId: topic.id, type: 'open-topic' });
          this.emit({ type: 'invalidate-topics' });
        },
        parts,
        reasoningEffort: input.reasoningEffort,
        ...(models.length > 1 ? { siblingsGroupId: nextSiblingsGroupId() } : {}),
        topic,
      });
    } catch (error) {
      this.activeTurns.delete(NEW_TOPIC_SNAPSHOT_KEY);
      if (createdTopicId) {
        this.activeTurns.delete(createdTopicId);
        await this.invalidateTopicMessagesSafely(createdTopicId);
        this.setTopicSnapshot(createdTopicId, idleTopicSnapshot);
      }
      if (createdTopicId && this.newTopicHandoffTopicId === createdTopicId) {
        this.newTopicHandoffTopicId = undefined;
      }
      this.setTopicSnapshot(NEW_TOPIC_SNAPSHOT_KEY, idleTopicSnapshot);

      if (!abortController.signal.aborted) {
        logger.warn('New topic chat stream failed before reservation', toError(error));
        throw toError(error);
      }
    }
  }

  /**
   * Record the user's decision on one tool-approval request. Once every
   * request on the message is decided, the turn resumes into the same
   * assistant row; while some remain, the topic stays awaiting approval so the
   * sheet can collect the rest. Duplicate decisions are idempotent and never
   * dispatch a second continuation.
   */
  private async respondToolApprovalTask(input: ChatToolApprovalInput): Promise<void> {
    const { messageId, topicId } = input;

    if (this.isTopicBusy(topicId)) {
      throw new Error('A response is already streaming for this topic.');
    }

    const activeTurn = createActiveTurn();
    const { abortController } = activeTurn;
    this.activateTurn(topicId, activeTurn);
    this.setTopicSnapshot(topicId, { status: 'reserving' });

    let settledMessage: Message | undefined;
    let shouldRemainAwaitingApproval = true;

    try {
      const applied = await this.dependencies.services.message.applyToolApprovalDecisions(
        messageId,
        [
          {
            approvalId: input.approvalId,
            approved: input.approved,
            ...(input.reason !== undefined && { reason: input.reason }),
            ...(input.updatedInput !== undefined && { updatedInput: input.updatedInput }),
          },
        ],
      );
      await this.invalidateTopicMessagesSafely(topicId);

      if (!applied) {
        shouldRemainAwaitingApproval = false;
        throw new Error('The tool approval message no longer exists.');
      }

      if (applied.appliedApprovalIds.length === 0) {
        this.activeTurns.delete(topicId);
        const hasPendingApproval = hasPendingToolApproval(applied.parts);
        shouldRemainAwaitingApproval = hasPendingApproval;
        this.setTopicSnapshot(topicId, {
          status: hasPendingApproval ? 'awaiting-approval' : 'idle',
        });
        if (applied.alreadySettledApprovalIds.includes(input.approvalId)) {
          if (!hasPendingApproval) this.dependencies.backgroundReply.clearTopic(topicId);
          return;
        }

        throw new Error('The tool approval request was not found on the message.');
      }

      if (hasPendingToolApproval(applied.parts)) {
        this.activeTurns.delete(topicId);
        this.setTopicSnapshot(topicId, { status: 'awaiting-approval' });
        return;
      }

      shouldRemainAwaitingApproval = false;
      settledMessage = await this.dependencies.services.message.getById(messageId);
      throwIfAborted(abortController.signal);
      await this.resumeApprovedTurn({ activeTurn, message: settledMessage });
    } catch (error) {
      // Once the last decision landed the row is `pending` with its approvals
      // answered but unresumed — a state nothing else recovers from. The
      // failures that reach here with it still unsettled are `resumeApprovedTurn`'s
      // prelude (topic read, model resolve, history read), which persist
      // nothing. Past that, `streamAssistantTurn` owns the row and has already
      // released the turn, which is what the identity check below detects.
      if (settledMessage && this.activeTurns.get(topicId) === activeTurn) {
        await this.settleFailedTurn({
          assistantMessage: settledMessage,
          error,
          wasAborted: abortController.signal.aborted,
        });
      }
      if (!shouldRemainAwaitingApproval && !activeTurn.backgroundReply) {
        this.dependencies.backgroundReply.clearTopic(topicId);
      }

      this.activeTurns.delete(topicId);
      await this.invalidateTopicMessagesSafely(topicId);
      this.setTopicSnapshot(
        topicId,
        shouldRemainAwaitingApproval ? { status: 'awaiting-approval' } : idleTopicSnapshot,
      );

      if (!abortController.signal.aborted) {
        logger.warn('Tool approval failed before resuming', toError(error));
        throw toError(error);
      }
    }
  }

  private async resumeApprovedTurn(input: {
    activeTurn: ActiveTurn;
    message: Message;
  }): Promise<void> {
    const { activeTurn, message } = input;
    const { signal } = activeTurn.abortController;
    const topic = await this.dependencies.services.topic.getById(message.topicId);
    throwIfAborted(signal);
    const model = await this.resolveResumeModel(message, topic);
    throwIfAborted(signal);
    // getPathToNode includes the node itself, so the history tip is this very
    // assistant row — which is what makes the SDK continue its message id.
    const history = await this.dependencies.services.message.getPathToNode(message.id);
    throwIfAborted(signal);

    // A first exchange that waited for approval skipped auto-naming; catch up
    // once the resumed segment succeeds so the topic doesn't stay "New chat".
    const isFirstExchange = history.length === 2 && history[0]?.role === 'user';
    const autoNameUserParts = isFirstExchange ? history[0]?.data.parts : undefined;
    const executionAbortController = createExecutionAbortController(activeTurn.abortController);
    activeTurn.executions.set(model.id, {
      abortController: executionAbortController,
      assistantMessage: message,
      model,
      pendingApprovalToolCallIds: new Set(),
      status: 'streaming',
    });
    activeTurn.overlays.set(model.id, message);
    this.publishTurnSnapshot(topic.id, activeTurn, 'streaming');

    try {
      await this.startBackgroundReply(activeTurn, topic, model);
      await this.streamAssistantTurn({
        activeTurn,
        assistantMessage: message,
        ...(autoNameUserParts ? { autoNameUserParts } : {}),
        fastMode: message.data.turnOptions?.fastMode,
        history,
        model,
        reasoningEffort: message.data.turnOptions?.reasoningEffort,
        topic,
      });
    } finally {
      const terminalMessage = activeTurn.overlays.get(model.id);
      await this.finishTurn({
        activeTurn,
        terminalMessages: terminalMessage ? [terminalMessage] : [],
        topicId: topic.id,
      });
    }
  }

  /**
   * Resume with the model that produced the approval-waiting segment (row-level
   * `modelId`, matching desktop), falling back to the current defaults only
   * when that model has since been removed.
   */
  private async resolveResumeModel(message: Message, topic: Topic): Promise<Model> {
    if (message.modelId) {
      const model = await this.dependencies.services.model.getById(message.modelId);
      if (model) {
        return model;
      }

      logger.warn('Resume model no longer exists; falling back to defaults', {
        modelId: message.modelId,
      });
    }

    return await this.resolveModel(undefined, topic);
  }

  private async buildAssistantMessageSnapshot(
    model: Model,
    topic: Pick<Topic, 'assistantId'>,
  ): Promise<MessageSnapshot | undefined> {
    if (!topic.assistantId) {
      return undefined;
    }

    const assistant = await this.dependencies.services.assistant.getById(topic.assistantId);
    return {
      emoji: assistant.emoji,
      id: assistant.id,
      model: toModelSnapshot(model),
      name: assistant.name,
    };
  }

  private async runTopicTurn(input: {
    activeTurn: ActiveTurn;
    allowAutoName?: boolean;
    fastMode?: boolean;
    hasHistoryBeforePendingTurn?: boolean;
    models: readonly Model[];
    /**
     * Run once the turn is in the snapshot and before it is persisted — the
     * only safe moment to move the user to this topic, because the destination
     * already has something to show.
     */
    onTurnPublished?: () => Promise<void> | void;
    parentId?: string | null;
    parts: readonly CherryMessagePart[];
    reasoningEffort?: ChatSendTextInput['reasoningEffort'];
    siblingsGroupId?: number;
    topic: Topic;
    userSiblingsGroupId?: number;
  }): Promise<void> {
    const { activeTurn, models, parts, topic } = input;
    const topicId = topic.id;
    const hasHistoryBeforePendingTurn =
      input.hasHistoryBeforePendingTurn ?? Boolean(topic.activeNodeId);
    const { abortController } = activeTurn;
    let userMessage: Message | undefined;
    let assistantPlaceholders: Message[] = [];
    let terminalAssistantMessages: Message[] = [];
    let entriesCommitted = false;
    let createdEntries: FileEntry[] = [];
    let turnParts = [...parts];
    let handedOffToStream = false;

    try {
      const managed = await this.dependencies.files.createParts(parts);
      createdEntries = managed.entries;
      turnParts = managed.parts;
      const messageSnapshots = await Promise.all(
        models.map((model) => this.buildAssistantMessageSnapshot(model, topic)),
      );
      throwIfAborted(abortController.signal);
      const pendingTurn = buildPendingTurnMessages({
        messageSnapshots,
        models,
        newMessageId: () => this.dependencies.services.message.newMessageId(),
        parentId: input.parentId === undefined ? (topic.activeNodeId ?? null) : input.parentId,
        parts: turnParts,
        siblingsGroupId: input.siblingsGroupId ?? 0,
        topicId,
        turnOptions: {
          fastMode: input.fastMode === true,
          reasoningEffort: input.reasoningEffort,
        },
        userSiblingsGroupId: input.userSiblingsGroupId ?? 0,
      });

      // 先把这一轮发布出去，再让调用方导航。这样目的地挂载时它要展示的东西已经在快照里，
      // 中间不存在「界面已经切过去、内容还没有」的空窗——那段空窗过去要靠遮罩、转圈和空状态
      // 一起糊住。落库后回来的行与这份乐观行是同一个 id，投影就地替换而不是追加。
      activeTurn.hasHistoryBeforePendingTurn = hasHistoryBeforePendingTurn;
      activeTurn.pendingUserMessage = pendingTurn.userMessage;
      for (const [index, model] of models.entries()) {
        activeTurn.overlays.set(model.id, pendingTurn.placeholders[index]);
      }
      this.publishTurnSnapshot(topicId, activeTurn, 'reserving');
      await input.onTurnPublished?.();
      throwIfAborted(abortController.signal);

      const reservedTurn =
        await this.dependencies.services.message.createUserMessageWithPlaceholders({
          ...(input.siblingsGroupId !== undefined
            ? { siblingsGroupId: input.siblingsGroupId }
            : {}),
          topicId,
          userMessage: {
            mode: 'create',
            id: pendingTurn.userMessage.id,
            dto: {
              data: pendingTurn.userMessage.data,
              modelId: models[0]?.id,
              parentId: pendingTurn.userMessage.parentId,
              role: 'user',
              ...(input.userSiblingsGroupId !== undefined
                ? { siblingsGroupId: input.userSiblingsGroupId }
                : {}),
              status: 'success',
            },
          },
          placeholders: pendingTurn.placeholders.map((placeholder, index) => {
            const messageSnapshot = messageSnapshots[index];
            return {
              data: placeholder.data,
              id: placeholder.id,
              modelId: models[index].id,
              ...(messageSnapshot ? { messageSnapshot } : {}),
              role: 'assistant',
              status: 'pending',
            };
          }),
        });
      entriesCommitted = true;
      if (abortController.signal.aborted) {
        await this.cancelReservedTurn({
          topicId,
          userMessageId: reservedTurn.userMessage.id,
        });
        return;
      }

      userMessage = reservedTurn.userMessage;
      assistantPlaceholders = reservedTurn.placeholders;
      handedOffToStream = true;
      await this.runReservedExecutions({
        activeTurn,
        allowAutoName: input.allowAutoName !== false,
        assistantPlaceholders,
        autoNameUserParts: turnParts,
        fastMode: input.fastMode,
        hasHistoryBeforePendingTurn,
        models,
        pendingUserMessage: userMessage,
        reasoningEffort: input.reasoningEffort,
        topic,
        userMessage,
      });
    } catch (error) {
      // Past the handoff the stream owns the row: it has already persisted its
      // own terminal state and released the turn. Persisting again from here
      // would fall back to the placeholder's empty parts and overwrite
      // everything that streamed in.
      if (handedOffToStream) {
        logger.warn('Chat turn failed after the stream took over', toError(error));
      } else if (assistantPlaceholders.length > 0) {
        terminalAssistantMessages = (
          await Promise.all(
            assistantPlaceholders.map((assistantMessage) =>
              this.settleFailedTurn({
                assistantMessage,
                error,
                wasAborted: abortController.signal.aborted,
              }),
            ),
          )
        ).filter((message): message is Message => message !== undefined);

        if (!abortController.signal.aborted) {
          logger.warn('Chat stream failed', toError(error));
        }
      } else if (!abortController.signal.aborted) {
        throw toError(error);
      }
    } finally {
      if (!entriesCommitted) {
        await this.dependencies.files.discard(createdEntries);
      }

      if (!handedOffToStream) {
        await this.releaseTurn({
          activeTurn,
          terminalSnapshot:
            terminalAssistantMessages.length > 0
              ? {
                  overlayMessage: terminalAssistantMessages.at(-1),
                  overlayMessages: terminalAssistantMessages,
                  pendingUserMessage: userMessage,
                  status: 'idle',
                }
              : undefined,
          topicId,
        });
      }
    }
  }

  private async runExistingUserTurn(input: {
    activeTurn: ActiveTurn;
    fastMode?: boolean;
    isSteer?: boolean;
    models: readonly Model[];
    reasoningEffort?: ChatSendTextInput['reasoningEffort'];
    siblingsGroupId?: number;
    topic: Topic;
    userMessage: Message;
  }): Promise<void> {
    const { activeTurn, models, topic, userMessage } = input;
    const messageSnapshots = await Promise.all(
      models.map((model) => this.buildAssistantMessageSnapshot(model, topic)),
    );
    throwIfAborted(activeTurn.abortController.signal);
    const reservedTurn = await this.dependencies.services.message.createUserMessageWithPlaceholders(
      {
        ...(input.siblingsGroupId !== undefined ? { siblingsGroupId: input.siblingsGroupId } : {}),
        topicId: topic.id,
        userMessage: { id: userMessage.id, mode: 'existing' },
        placeholders: models.map((model, index) => {
          const messageSnapshot = messageSnapshots[index];
          return {
            data: {
              parts: [],
              turnOptions: {
                fastMode: input.fastMode === true,
                reasoningEffort: input.reasoningEffort,
              },
            },
            modelId: model.id,
            ...(messageSnapshot ? { messageSnapshot } : {}),
            role: 'assistant',
            status: 'pending',
          };
        }),
      },
    );

    await this.runReservedExecutions({
      activeTurn,
      allowAutoName: false,
      assistantPlaceholders: reservedTurn.placeholders,
      fastMode: input.fastMode,
      hasHistoryBeforePendingTurn: true,
      isSteer: input.isSteer === true,
      models,
      reasoningEffort: input.reasoningEffort,
      topic,
      userMessage: reservedTurn.userMessage,
    });
  }

  private async runReservedExecutions(input: {
    activeTurn: ActiveTurn;
    allowAutoName: boolean;
    assistantPlaceholders: readonly Message[];
    autoNameUserParts?: readonly CherryMessagePart[];
    fastMode?: boolean;
    hasHistoryBeforePendingTurn: boolean;
    isSteer?: boolean;
    models: readonly Model[];
    pendingUserMessage?: Message;
    reasoningEffort?: ChatSendTextInput['reasoningEffort'];
    topic: Topic;
    userMessage: Message;
  }): Promise<void> {
    const { activeTurn, assistantPlaceholders, models, topic, userMessage } = input;
    if (assistantPlaceholders.length !== models.length) {
      throw new Error(
        `Reserved ${assistantPlaceholders.length} assistant messages for ${models.length} models.`,
      );
    }

    activeTurn.hasHistoryBeforePendingTurn = input.hasHistoryBeforePendingTurn;
    activeTurn.pendingUserMessage = input.pendingUserMessage;
    for (let index = 0; index < models.length; index += 1) {
      const model = models[index];
      const assistantMessage = assistantPlaceholders[index];
      const abortController = createExecutionAbortController(activeTurn.abortController);
      activeTurn.executions.set(model.id, {
        abortController,
        assistantMessage,
        model,
        pendingApprovalToolCallIds: new Set(),
        status: 'streaming',
      });
      activeTurn.overlays.set(model.id, assistantMessage);
    }
    this.publishTurnSnapshot(topic.id, activeTurn, 'streaming');

    let terminalMessages: Message[] = [];
    try {
      await this.emitAndWait({ topicId: topic.id, type: 'invalidate-topic-messages' });
      throwIfAborted(activeTurn.abortController.signal);
      const storedHistory = await this.dependencies.services.message.getPathToNode(userMessage.id);
      const history = input.isSteer ? withSteerReminder(storedHistory) : storedHistory;
      const shouldAutoName = input.allowAutoName && history.length === 1;
      throwIfAborted(activeTurn.abortController.signal);
      await this.startBackgroundReply(activeTurn, topic, models[0]);

      await Promise.allSettled(
        models.map((model, index) =>
          this.streamAssistantTurn({
            activeTurn,
            assistantMessage: assistantPlaceholders[index],
            ...(shouldAutoName && index === 0 && input.autoNameUserParts
              ? { autoNameUserParts: input.autoNameUserParts }
              : {}),
            fastMode: input.fastMode,
            history,
            model,
            reasoningEffort: input.reasoningEffort,
            topic,
          }),
        ),
      );
      terminalMessages = [...activeTurn.overlays.values()];
    } catch (error) {
      terminalMessages = (
        await Promise.all(
          assistantPlaceholders.map(async (assistantMessage, index) => {
            const model = models[index];
            const execution = activeTurn.executions.get(model.id);
            if (execution?.status !== 'streaming') {
              return activeTurn.overlays.get(model.id);
            }
            execution.status = activeTurn.abortController.signal.aborted ? 'aborted' : 'error';
            const terminal = await this.settleFailedTurn({
              assistantMessage,
              error,
              wasAborted: activeTurn.abortController.signal.aborted,
            });
            if (terminal) activeTurn.overlays.set(model.id, terminal);
            return terminal;
          }),
        )
      ).filter((message): message is Message => message !== undefined);
    } finally {
      await this.finishTurn({
        activeTurn,
        hasHistoryBeforePendingTurn: input.hasHistoryBeforePendingTurn,
        pendingUserMessage: input.pendingUserMessage,
        terminalMessages,
        topicId: topic.id,
      });
    }
  }

  private async finishTurn(input: {
    activeTurn: ActiveTurn;
    hasHistoryBeforePendingTurn?: boolean;
    pendingUserMessage?: Message;
    terminalMessages: readonly Message[];
    topicId: string;
  }): Promise<void> {
    const outcome = resolveTurnOutcome(input.activeTurn, input.terminalMessages);
    this.settleBackgroundReply(input.activeTurn);
    input.activeTurn.streamStatus = outcome === 'awaiting-approval' ? 'awaiting-approval' : outcome;
    if (outcome === 'done') {
      input.activeTurn.lastCompletedAt = Date.now();
    }
    if (outcome === 'aborted' || outcome === 'error') {
      this.pendingSteers.delete(input.topicId);
    }
    const shouldContinue = outcome === 'done' && this.hasPendingContinuation(input.topicId);
    if (shouldContinue) {
      this.continuingTopics.add(input.topicId);
    }

    await this.releaseTurn({
      activeTurn: input.activeTurn,
      preserveSnapshot: shouldContinue,
      terminalSnapshot:
        input.terminalMessages.length > 0
          ? {
              hasHistoryBeforePendingTurn: input.hasHistoryBeforePendingTurn,
              overlayMessage: input.terminalMessages.at(-1),
              overlayMessages: input.terminalMessages,
              pendingUserMessage: input.pendingUserMessage,
              stream: buildStreamStatusSnapshot(input.activeTurn),
              status:
                outcome === 'awaiting-approval'
                  ? 'awaiting-approval'
                  : shouldContinue
                    ? 'streaming'
                    : 'idle',
            }
          : undefined,
      topicId: input.topicId,
    });

    if (!shouldContinue) {
      return;
    }

    try {
      await this.startNextPendingTurn(input.topicId);
    } catch (error) {
      this.pendingSteers.delete(input.topicId);
      this.continuingTopics.delete(input.topicId);
      logger.error('Failed to start queued chat continuation', toError(error));
      this.setTurnSnapshot(input.topicId, { error: toError(error), status: 'idle' });
    }
  }

  private async startNextPendingTurn(topicId: string): Promise<void> {
    const pendingSteers = this.pendingSteers.get(topicId);
    const pendingSteer = pendingSteers?.shift();
    if (pendingSteers?.length === 0) {
      this.pendingSteers.delete(topicId);
    }

    this.continuingTopics.delete(topicId);
    if (pendingSteer) {
      await this.startSteerContinuation(topicId, pendingSteer);
      return;
    }

    const followUps = this.followUpQueues.get(topicId);
    const followUp = followUps?.shift();
    if (followUps?.length === 0) {
      this.followUpQueues.delete(topicId);
    }
    this.publishQueuedMessages(topicId);
    if (followUp) {
      await this.sendFollowUpPayloadTask(topicId, followUp);
    }
  }

  private async startSteerContinuation(topicId: string, pending: PendingSteer): Promise<void> {
    const activeTurn = createActiveTurn();
    this.activateTurn(topicId, activeTurn);
    this.setTurnSnapshot(topicId, { status: 'reserving' });

    try {
      const topic = await this.dependencies.services.topic.getById(topicId);
      const userMessage = await this.dependencies.services.message.getById(pending.userMessageId);
      assertMessageBelongsToTopic(userMessage, topicId);
      if (userMessage.role !== 'user') {
        throw new Error('A steer continuation must be anchored on a user message.');
      }
      const model = await this.resolveResumeModel(userMessage, topic);
      throwIfAborted(activeTurn.abortController.signal);
      await this.runExistingUserTurn({
        activeTurn,
        fastMode: pending.fastMode,
        isSteer: true,
        models: [model],
        reasoningEffort: pending.reasoningEffort,
        topic,
        userMessage,
      });
    } catch (error) {
      if (this.activeTurns.get(topicId) === activeTurn) {
        this.activeTurns.delete(topicId);
      }
      await this.invalidateTopicMessagesSafely(topicId);
      if (!activeTurn.abortController.signal.aborted) {
        throw toError(error);
      }
    }
  }

  /**
   * Hand the topic back: drop the turn, then show the terminal overlay until
   * the refetch lands. The turn goes first because nothing after it is
   * guaranteed to run — a subscriber or a refetch can fail — and a stranded
   * `activeTurns` entry answers "already streaming" to every later send.
   */
  private async releaseTurn(input: {
    activeTurn: ActiveTurn;
    preserveSnapshot?: boolean;
    terminalSnapshot?: ChatTopicSnapshot;
    topicId: string;
  }): Promise<void> {
    const { activeTurn, topicId } = input;

    if (this.activeTurns.get(topicId) === activeTurn) {
      this.activeTurns.delete(topicId);
    }
    if (this.newTopicHandoffTopicId === topicId) {
      this.newTopicHandoffTopicId = undefined;
      this.setTopicSnapshot(NEW_TOPIC_SNAPSHOT_KEY, idleTopicSnapshot);
    }
    if (input.terminalSnapshot) {
      this.setTurnSnapshot(topicId, input.terminalSnapshot);
    }

    await this.invalidateTopicMessagesSafely(topicId);
    await waitForNextPaint();
    // A send that started during the wait owns the topic now; overwriting its
    // snapshot with `idle` would strip the spinner off a live turn.
    if (
      !input.preserveSnapshot &&
      !this.activeTurns.has(topicId) &&
      input.terminalSnapshot?.status !== 'awaiting-approval'
    ) {
      this.setTurnSnapshot(topicId, idleTopicSnapshot);
    }
  }

  /**
   * Stream one assistant turn into an existing assistant message row. Shared
   * by the fresh-turn path (runTopicTurn) and the approval-resume path
   * (resumeApprovedTurn): `history` must end at the node the model should see
   * last — when its tip is `assistantMessage` itself (resume), the SDK
   * continues that message id instead of minting a new one.
   *
   * The topic-level coordinator owns teardown after every sibling execution
   * reaches a terminal state.
   */
  private async streamAssistantTurn(input: {
    activeTurn: ActiveTurn;
    assistantMessage: Message;
    autoNameUserParts?: readonly CherryMessagePart[];
    fastMode?: boolean;
    history: readonly Message[];
    model: Model;
    reasoningEffort?: ChatSendTextInput['reasoningEffort'];
    topic: Topic;
  }): Promise<void> {
    const { activeTurn, assistantMessage, history, model, topic } = input;
    const topicId = topic.id;
    const execution = activeTurn.executions.get(model.id);
    if (!execution || execution.assistantMessage.id !== assistantMessage.id) {
      throw new Error(`No active execution for model: ${model.id}`);
    }
    const { abortController } = execution;
    let latestAssistantMessage: CherryUIMessage | undefined;
    let terminalAssistantMessage: Message | undefined;
    let cleanupIdleTimer: (() => void) | undefined;
    const runtimeTiming = new MessageRuntimeTimingCollector(assistantMessage.stats?.runtimeTiming);

    try {
      const rawStream = await this.dependencies.services.ai.streamText({
        assistantId: topic.assistantId,
        chatId: topicId,
        fastMode: input.fastMode === true,
        messageId: assistantMessage.id,
        messages: history.map(toCherryUIMessage),
        requestOptions: { signal: abortController.signal },
        reasoningEffort: input.reasoningEffort,
        runtimeTimingSink: runtimeTiming.sink,
        shouldYield: () => this.hasPendingSteer(topicId),
        trigger: 'submit-message',
        uniqueModelId: model.id,
      });
      throwIfAborted(abortController.signal);
      const idleWrapped = withIdleTimeout(rawStream, abortController, this.config.idleTimeoutMs);
      cleanupIdleTimer = idleWrapped.idle.cleanup;
      const stream = tapReadableStream(idleWrapped.stream, (chunk) => {
        this.handleStreamChunk(topicId, activeTurn, execution, chunk);
        if (execution.pendingApprovalToolCallIds.size > 0) {
          idleWrapped.idle.reset(this.config.approvalIdleTimeoutMs);
        }
      });

      for await (const nextAssistantMessage of this.dependencies.services.ai.readMessageStream({
        message: toCherryUIMessage(assistantMessage),
        stream,
      })) {
        latestAssistantMessage = nextAssistantMessage;
        if (activeTurn.backgroundReplyModelId === model.id) {
          activeTurn.backgroundReply?.update(nextAssistantMessage);
        }
        captureApprovalTiming(runtimeTiming, nextAssistantMessage.parts as CherryMessagePart[]);
        throwIfAborted(abortController.signal);
        activeTurn.overlays.set(
          model.id,
          applyStreamingMessage(assistantMessage, nextAssistantMessage),
        );
        this.publishTurnSnapshot(topicId, activeTurn, 'streaming');
      }

      throwIfAborted(abortController.signal);
      // A clean finish can still be waiting on the user's approval. The row is
      // terminally persisted as `success`; the live topic state carries the
      // separate awaiting-approval state, matching desktop semantics.
      const finalParts = (latestAssistantMessage?.parts ?? []) as CherryMessagePart[];
      if (hasUnresumedToolApproval(finalParts)) {
        // Settling this as a success would persist a tool call with no result,
        // and every later request on the branch would carry it.
        throw new Error('The approved tool was not available to this run.');
      }

      const isAwaitingApproval = hasPendingToolApproval(finalParts);
      syncPendingApprovalToolCallIds(execution, finalParts);
      runtimeTiming.closeOpenToolSpans();
      if (!isAwaitingApproval) {
        runtimeTiming.closeOpenSpans();
        runtimeTiming.complete();
      }
      terminalAssistantMessage = await this.persistSuccessfulAssistantMessage({
        assistantMessage,
        latestAssistantMessage,
        runtimeStats: { runtimeTiming: runtimeTiming.snapshot() },
      });
      execution.status = 'done';

      if (!this.isDisposed && !isAwaitingApproval && input.autoNameUserParts) {
        const namingTask = this.autoNameTopicFromSummary({
          assistantId: topic.assistantId,
          assistantParts: (latestAssistantMessage?.parts ?? []) as CherryMessagePart[],
          topicId,
          userParts: input.autoNameUserParts,
        });
        this.trackTask(namingTask);
        void namingTask.catch((error) => {
          logger.warn('Topic auto-naming failed', toError(error));
        });
      }
    } catch (error) {
      runtimeTiming.closeOpenSpans();
      runtimeTiming.complete();
      terminalAssistantMessage = await this.settleFailedTurn({
        assistantMessage,
        error,
        latestAssistantMessage,
        runtimeStats: { runtimeTiming: runtimeTiming.snapshot() },
        wasAborted: abortController.signal.aborted,
      });
      execution.status = abortController.signal.aborted ? 'aborted' : 'error';
      execution.pendingApprovalToolCallIds.clear();

      if (!abortController.signal.aborted) {
        logger.warn('Chat stream failed', toError(error));
      }
    } finally {
      cleanupIdleTimer?.();
      if (terminalAssistantMessage) {
        activeTurn.overlays.set(model.id, terminalAssistantMessage);
      }
      if (
        [...activeTurn.executions.values()].some((candidate) => candidate.status === 'streaming')
      ) {
        this.publishTurnSnapshot(topicId, activeTurn, 'streaming');
      }
    }
  }

  private handleStreamChunk(
    topicId: string,
    activeTurn: ActiveTurn,
    execution: ActiveExecution,
    chunk: UIMessageChunk,
  ): void {
    if (this.activeTurns.get(topicId) !== activeTurn || execution.status !== 'streaming') {
      return;
    }

    const hadPendingApproval = execution.pendingApprovalToolCallIds.size > 0;
    if (chunk.type === 'tool-approval-request') {
      execution.pendingApprovalToolCallIds.add(chunk.toolCallId);
    } else if (
      chunk.type === 'tool-output-available' ||
      chunk.type === 'tool-output-denied' ||
      chunk.type === 'tool-output-error'
    ) {
      execution.pendingApprovalToolCallIds.delete(chunk.toolCallId);
    }

    const approvalStateChanged =
      hadPendingApproval !== execution.pendingApprovalToolCallIds.size > 0;
    if (activeTurn.streamStatus === 'pending') {
      activeTurn.streamStatus = 'streaming';
      this.publishTurnSnapshot(topicId, activeTurn, 'streaming');
    } else if (approvalStateChanged) {
      this.publishTurnSnapshot(topicId, activeTurn, 'streaming');
    }
  }

  private async cancelReservedTurn(input: { topicId: string; userMessageId: string }) {
    try {
      await this.dependencies.services.message.delete(input.userMessageId, true, 'parent');
    } catch (error) {
      logger.warn('Failed to cancel reserved chat turn', toError(error));
    }
  }

  /**
   * Fire-and-forget: not awaited by the caller, so the naming LLM call
   * never delays the turn's snapshot from reaching 'idle'.
   */
  private async autoNameTopicFromSummary(input: {
    assistantId?: string;
    assistantParts: readonly CherryMessagePart[];
    topicId: string;
    userParts: readonly CherryMessagePart[];
  }): Promise<void> {
    const userText = extractMainText(input.userParts);
    const assistantText = extractMainText(input.assistantParts);
    if (!userText || !assistantText) {
      return;
    }

    const renamed = await maybeRenameTopicFromConversationSummary({
      assistantId: input.assistantId,
      assistantText,
      onFailure: () => {
        this.emit({ topicId: input.topicId, type: 'topic-rename-failed' });
      },
      services: this.dependencies.services,
      topicId: input.topicId,
      userText,
    });

    if (renamed) {
      await this.emitAndWait({ type: 'invalidate-topics' });
    }
  }

  private emit(event: Parameters<ChatListener>[0]): void {
    for (const listener of this.listeners) {
      // One bad subscriber must not take the notification — or the teardown
      // that is often driving it — down with it.
      try {
        void Promise.resolve(listener(event)).catch((error) => {
          logger.error('Chat runtime listener failed', toError(error));
        });
      } catch (error) {
        logger.error('Chat runtime listener failed', toError(error));
      }
    }
  }

  private async emitAndWait(event: Parameters<ChatListener>[0]): Promise<void> {
    await Promise.all([...this.listeners].map((listener) => listener(event)));
  }

  /**
   * Persist the terminal state of a turn that died. Failures are logged, never
   * rethrown: the caller is already unwinding one error, and letting a second
   * one escape strands the row mid-flight — `pending` forever, with its tool
   * approvals unsettled.
   */
  private async settleFailedTurn(input: {
    assistantMessage: Message;
    error: unknown;
    latestAssistantMessage?: CherryUIMessage;
    runtimeStats?: MessageRuntimeStatsInput;
    wasAborted: boolean;
  }): Promise<Message | undefined> {
    try {
      return await this.persistFailedAssistantMessage(input);
    } catch (error) {
      logger.error('Failed to persist the terminal state of a failed turn', toError(error));
      return undefined;
    }
  }

  /**
   * Refetch after a failure or during teardown. A throwing invalidate must not
   * take the rest of the cleanup with it — that would leave the topic's
   * `activeTurns` entry behind and lock it out of every future send.
   */
  private async invalidateTopicMessagesSafely(topicId: string): Promise<void> {
    try {
      await this.emitAndWait({ topicId, type: 'invalidate-topic-messages' });
    } catch (error) {
      logger.error('Failed to refresh messages after a turn ended', toError(error));
    }
  }

  private async persistFailedAssistantMessage(input: {
    assistantMessage: Message;
    error: unknown;
    latestAssistantMessage?: CherryUIMessage;
    runtimeStats?: MessageRuntimeStatsInput;
    wasAborted: boolean;
  }): Promise<Message | undefined> {
    // Fall back to the row's own parts when the stream died before its first
    // chunk — on a resume that row already holds the first segment, and an
    // empty-parts update would wipe it.
    const latestParts = finalizeTurnToolApprovals(
      (input.latestAssistantMessage?.parts ??
        input.assistantMessage.data.parts ??
        []) as CherryMessagePart[],
      interruptedTurnApprovalReason,
    );
    const dataParts = input.wasAborted ? latestParts : appendErrorPart(latestParts, input.error);
    const status = input.wasAborted ? 'paused' : 'error';
    return await this.dependencies.services.message.finalizeAssistantMessage(
      input.assistantMessage.id,
      {
        data: {
          parts: finalizeInterruptedParts(
            dropEmptyContentParts(dataParts as CherryMessagePart[]),
            status,
          ),
        },
        ...(input.runtimeStats ? { runtimeStats: input.runtimeStats } : {}),
        status,
      },
    );
  }

  private async persistSuccessfulAssistantMessage(input: {
    assistantMessage: Message;
    latestAssistantMessage?: CherryUIMessage;
    runtimeStats: MessageRuntimeStatsInput;
  }): Promise<Message> {
    const parts = (input.latestAssistantMessage?.parts ??
      input.assistantMessage.data.parts ??
      []) as CherryMessagePart[];
    // No approval settlement here: a turn that ends in success may legitimately
    // be waiting on `approval-requested`, and that part has to survive for the
    // sheet to reappear. `finalizeInterruptedParts` is identity on success, so
    // this only drops empty parts.
    return await this.dependencies.services.message.finalizeAssistantMessage(
      input.assistantMessage.id,
      {
        data: { parts: finalizeInterruptedParts(dropEmptyContentParts(parts), 'success') },
        runtimeStats: input.runtimeStats,
        status: 'success',
      },
    );
  }

  private async resolveTurnContext(input: ChatSendTextInput) {
    const topic = await this.resolveTopicForTurn(input);
    const model = await this.resolveModel(input.selectedModelId, topic);

    return { model, topic };
  }

  private async resolveTopicForTurn(
    input: Pick<ChatSendTextInput, 'assistantId' | 'topicId'>,
  ): Promise<Topic> {
    let topic = await this.dependencies.services.topic.getById(input.topicId);

    if (topic.activeNodeId) {
      const activeMessage = await this.dependencies.services.message.getById(topic.activeNodeId);
      if (hasPendingToolApproval(activeMessage.data.parts ?? [])) {
        throw new Error('Resolve the pending tool approval before sending another message.');
      }
    }

    if (input.assistantId !== undefined && input.assistantId !== (topic.assistantId ?? null)) {
      topic = await this.dependencies.services.topic.update(input.topicId, {
        assistantId: input.assistantId,
      });
      await this.emitAndWait({ type: 'invalidate-topics' });
      await this.emitAndWait({
        topicId: input.topicId,
        type: 'invalidate-topic-messages',
      });
    }

    return topic;
  }

  private async resolveModels(
    selectedModelIds: readonly UniqueModelId[] | undefined,
    topic: Pick<Topic, 'assistantId'>,
  ): Promise<Model[]> {
    const modelIds =
      selectedModelIds && selectedModelIds.length > 0
        ? [...selectedModelIds]
        : [await this.resolveModelId(undefined, topic)];
    const uniqueIds = uniqueModelIds(modelIds);
    if (uniqueIds.length !== modelIds.length) {
      throw new Error('A multi-model request cannot contain duplicate model IDs.');
    }

    return await Promise.all(
      uniqueIds.map(async (modelId) => {
        const model = await this.dependencies.services.model.getById(modelId);
        if (!model) {
          throw new Error(`Cannot resolve model: ${modelId}`);
        }
        return model;
      }),
    );
  }

  private async resolveAssistantSiblingsGroupId(input: {
    isRegenerate: boolean;
    models: readonly Model[];
    userMessageId: string;
  }): Promise<number | undefined> {
    if (input.models.length > 1) {
      return nextSiblingsGroupId();
    }
    if (!input.isRegenerate) {
      return undefined;
    }

    const children = await this.dependencies.services.message.getChildrenByParentId(
      input.userMessageId,
    );
    return (
      children.find((message) => message.siblingsGroupId > 0)?.siblingsGroupId ??
      nextSiblingsGroupId()
    );
  }

  private async resolveRegenerateUserMessage(target: Message): Promise<Message> {
    if (target.role === 'user') {
      return target;
    }
    if (target.role !== 'assistant' || !target.parentId) {
      throw new Error('Regenerate requires a user or assistant message.');
    }

    const parent = await this.dependencies.services.message.getById(target.parentId);
    if (parent.role !== 'user') {
      throw new Error('The assistant message is not attached to a user message.');
    }
    return parent;
  }

  private async resolveActiveAssistantChild(
    topic: Pick<Topic, 'activeNodeId'>,
    children: readonly Message[],
  ): Promise<Message | undefined> {
    const assistantChildren = children.filter((message) => message.role === 'assistant');
    if (!topic.activeNodeId || assistantChildren.length < 2) {
      return assistantChildren.at(-1);
    }

    const activePath = await this.dependencies.services.message.getPathToNode(topic.activeNodeId);
    const activeIds = new Set(activePath.map((message) => message.id));
    return (
      assistantChildren.find((message) => activeIds.has(message.id)) ?? assistantChildren.at(-1)
    );
  }

  private resolveRuntimeTopicId(topicId: string): string {
    if (topicId === NEW_TOPIC_SNAPSHOT_KEY && this.newTopicHandoffTopicId) {
      return this.newTopicHandoffTopicId;
    }

    return topicId;
  }

  private isTopicBusy(topicId: string): boolean {
    const runtimeTopicId = this.resolveRuntimeTopicId(topicId);
    return this.activeTurns.has(runtimeTopicId) || this.continuingTopics.has(runtimeTopicId);
  }

  private activateTurn(topicId: string, turn: ActiveTurn): void {
    this.activeTurns.set(topicId, turn);
  }

  private appendPendingSteer(topicId: string, pending: PendingSteer): void {
    const queue = this.pendingSteers.get(topicId);
    if (queue) {
      queue.push(pending);
    } else {
      this.pendingSteers.set(topicId, [pending]);
    }
  }

  private hasPendingSteer(topicId: string): boolean {
    return (this.pendingSteers.get(topicId)?.length ?? 0) > 0;
  }

  private hasPendingContinuation(topicId: string): boolean {
    return this.hasPendingSteer(topicId) || (this.followUpQueues.get(topicId)?.length ?? 0) > 0;
  }

  private publishQueuedMessages(topicId: string): void {
    const { queuedMessages: _queuedMessages, ...snapshot } = this.getTopicSnapshot(topicId);
    const queuedMessages = this.followUpQueues.get(topicId);
    this.setTurnSnapshot(topicId, {
      ...snapshot,
      ...(queuedMessages?.length ? { queuedMessages: [...queuedMessages] } : {}),
    });
  }

  private publishTurnSnapshot(
    topicId: string,
    activeTurn: ActiveTurn,
    status: Extract<ChatTopicSnapshot['status'], 'reserving' | 'streaming'>,
  ): void {
    const overlayMessages = [...activeTurn.overlays.values()];
    this.setTurnSnapshot(topicId, {
      hasHistoryBeforePendingTurn: activeTurn.hasHistoryBeforePendingTurn,
      overlayMessage: overlayMessages.at(-1),
      overlayMessages,
      pendingUserMessage: activeTurn.pendingUserMessage,
      ...(this.followUpQueues.get(topicId)?.length
        ? { queuedMessages: [...(this.followUpQueues.get(topicId) ?? [])] }
        : {}),
      status,
      stream: buildStreamStatusSnapshot(activeTurn),
    });
  }

  private setTurnSnapshot(topicId: string, snapshot: ChatTopicSnapshot): void {
    this.setTopicSnapshot(topicId, snapshot);

    if (this.newTopicHandoffTopicId === topicId) {
      this.setTopicSnapshot(NEW_TOPIC_SNAPSHOT_KEY, snapshot);
    }
  }

  private async resolveModel(
    selectedModelId?: UniqueModelId | null,
    topic?: Pick<Topic, 'assistantId'>,
  ) {
    const modelId = await this.resolveModelId(selectedModelId, topic);
    const model = await this.dependencies.services.model.getById(modelId);

    if (!model) {
      throw new Error(`Cannot resolve model: ${modelId}`);
    }

    return model;
  }

  private async startBackgroundReply(
    activeTurn: ActiveTurn,
    topic: Topic,
    model: Model | undefined,
  ): Promise<void> {
    if (activeTurn.backgroundReply || !model) return;

    try {
      const backgroundReply = this.dependencies.backgroundReply.startTurn({
        assistantName: await this.resolveBackgroundAssistantName(topic, model),
        topicId: topic.id,
        topicTitle: topic.name,
      });
      activeTurn.backgroundReply = backgroundReply;
      activeTurn.backgroundReplyModelId = model.id;
    } catch (error) {
      this.dependencies.backgroundReply.clearTopic(topic.id);
      logger.warn('Failed to start background reply lifecycle', toError(error), {
        topicId: topic.id,
      });
    }
  }

  private async resolveBackgroundAssistantName(topic: Topic, model: Model): Promise<string> {
    const fallbackName = model.name.trim();
    if (!topic.assistantId) return fallbackName;

    try {
      return (
        (await this.dependencies.services.assistant.getById(topic.assistantId)).name.trim() ||
        fallbackName
      );
    } catch (error) {
      logger.warn('Failed to resolve assistant name for background reply', toError(error), {
        assistantId: topic.assistantId,
        topicId: topic.id,
      });
      return fallbackName;
    }
  }

  private settleBackgroundReply(activeTurn: ActiveTurn): void {
    const turn = activeTurn.backgroundReply;
    const modelId = activeTurn.backgroundReplyModelId;
    if (!turn || !modelId) return;

    const execution = activeTurn.executions.get(modelId);
    const message = activeTurn.overlays.get(modelId);
    if (!execution) return;

    if (
      execution.status === 'done' &&
      message &&
      hasPendingToolApproval(message.data.parts ?? [])
    ) {
      turn.awaitApproval(toCherryUIMessage(message));
      return;
    }

    switch (execution.status) {
      case 'aborted':
        turn.finish('cancelled');
        break;
      case 'done':
        turn.finish('completed');
        break;
      case 'error':
        turn.finish('failed');
        break;
      case 'streaming':
        break;
    }
  }

  private async resolveModelId(
    selectedModelId?: UniqueModelId | null,
    topic?: Pick<Topic, 'assistantId'>,
  ) {
    if (selectedModelId) {
      return selectedModelId;
    }

    if (topic?.assistantId) {
      const assistant = await this.dependencies.services.assistant.getById(topic.assistantId);

      if (!assistant.modelId) {
        throw new Error(`Assistant ${topic.assistantId} has no model configured`);
      }

      return assistant.modelId;
    }

    const defaultModelId = await this.dependencies.services.preference.get('chat.default_model_id');

    if (!isUniqueModelId(defaultModelId)) {
      throw new Error('No default model configured for assistant-less topic');
    }

    return defaultModelId;
  }

  private setTopicSnapshot(topicId: string, snapshot: ChatTopicSnapshot): void {
    const queuedMessages = this.followUpQueues.get(topicId);
    const resolvedSnapshot =
      queuedMessages?.length && !snapshot.queuedMessages
        ? { ...snapshot, queuedMessages: [...queuedMessages] }
        : snapshot;
    if (
      resolvedSnapshot.status === 'idle' &&
      !resolvedSnapshot.overlayMessage &&
      !resolvedSnapshot.pendingUserMessage &&
      !resolvedSnapshot.queuedMessages?.length &&
      !resolvedSnapshot.error
    ) {
      this.topicSnapshots.delete(topicId);
    } else {
      this.topicSnapshots.set(topicId, resolvedSnapshot);
    }

    this.emit({ topicId, type: 'snapshot-changed' });
  }

  /**
   * Run one chat task under its topic's scope.
   *
   * The task, not the turn, is the unit registered: `finishTurn` awaits
   * `startNextPendingTurn`, so a queued steer or follow-up runs inside this same
   * promise. Registering per turn would let the drain see a topic go quiet
   * between two turns of one continuous chain and delete underneath it.
   *
   * Throws `ScopeFencedError` — as a rejection — when the topic is being
   * deleted. That is the intended answer: the send is refused rather than
   * reserving a row in a topic about to disappear.
   */
  private startTask(topicId: string, run: () => Promise<void>): Promise<void> {
    if (this.isDisposed) {
      return Promise.reject(new Error('Chat runtime is disposed.'));
    }

    let settle!: () => void;
    const binding: TaskScopeBinding = {
      handles: [],
      settled: new Promise<void>((resolve) => {
        settle = resolve;
      }),
    };

    try {
      binding.handles.push(this.registerTopicScope(topicId, binding.settled));
    } catch (error) {
      settle();
      return Promise.reject(error as Error);
    }

    if (topicId === NEW_TOPIC_SNAPSHOT_KEY) {
      this.newTopicScopeBinding = binding;
    }

    const task = run().finally(() => {
      if (this.newTopicScopeBinding === binding) {
        this.newTopicScopeBinding = undefined;
      }
      // Released before `settled` resolves, so a drain waiting on this task does
      // not then find it still registered.
      for (const handle of binding.handles) handle.release();
      settle();
    });
    this.trackTask(task);
    return task;
  }

  private registerTopicScope(topicId: string, settled: Promise<void>): OperationHandle {
    return this.scopes.register({
      cancel: () => this.cancelTopicWork(topicId),
      kind: 'chat.turn',
      scopes: [{ id: topicId, kind: 'topic' }],
      settled,
    });
  }

  /**
   * Extend the running new-topic task's scope to the topic it just created.
   *
   * Until this runs the task is registered only under the sentinel key, so a
   * delete naming the real id would find nothing to cancel. It cannot be fenced:
   * the topic did not exist a moment ago, so no pass can already name it.
   */
  private bindCreatedTopicScope(topicId: string): void {
    const binding = this.newTopicScopeBinding;
    if (!binding) return;
    this.newTopicScopeBinding = undefined;
    binding.handles.push(this.registerTopicScope(topicId, binding.settled));
  }

  /**
   * Stop everything this topic has running or queued.
   *
   * The queues are cleared first: `abort` ends the live turn, but a queued steer
   * or follow-up would start a fresh one inside the same task, and the drain
   * would then wait on work the cancellation existed to stop. It also covers the
   * window where the topic is `continuing` with no active turn at all, which
   * `abort` alone treats as a silent no-op.
   */
  private cancelTopicWork(topicId: string): void {
    const runtimeTopicId = this.resolveRuntimeTopicId(topicId);
    this.pendingSteers.delete(runtimeTopicId);
    this.followUpQueues.delete(runtimeTopicId);
    // Scope cancellation invalidates the whole conversation context. Cancel
    // its presentation synchronously so the Activity session releases its
    // keep-alive lease before the coordinator's drain can open the mutation.
    this.dependencies.backgroundReply.clearTopic(runtimeTopicId);
    this.abort(topicId);
  }

  private trackTask(task: Promise<unknown>): void {
    this.activeTasks.add(task);
    void task.then(
      () => this.activeTasks.delete(task),
      () => this.activeTasks.delete(task),
    );
  }
}

let siblingsGroupCounter = 0;
let streamTurnSequence = 0;

function nextSiblingsGroupId(): number {
  siblingsGroupCounter = (siblingsGroupCounter + 1) % 1000;
  return Date.now() * 1000 + siblingsGroupCounter;
}

function createActiveTurn(): ActiveTurn {
  return {
    abortController: new AbortController(),
    executions: new Map(),
    overlays: new Map(),
    streamStatus: 'pending',
    turnId: `${Date.now()}:${++streamTurnSequence}`,
  };
}

function createExecutionAbortController(parent: AbortController): AbortController {
  const controller = new AbortController();
  const abort = () => controller.abort(parent.signal.reason);
  if (parent.signal.aborted) {
    abort();
  } else {
    parent.signal.addEventListener('abort', abort, { once: true });
  }
  return controller;
}

function uniqueModelIds(modelIds: readonly UniqueModelId[]): UniqueModelId[] {
  return [...new Set(modelIds)];
}

function assertMessageBelongsToTopic(message: Message, topicId: string): void {
  if (message.topicId !== topicId) {
    throw new Error(`Message ${message.id} does not belong to topic ${topicId}.`);
  }
}

function resolveTurnOutcome(
  activeTurn: ActiveTurn,
  terminalMessages: readonly Message[],
): 'aborted' | 'awaiting-approval' | 'done' | 'error' {
  if (terminalMessages.some((message) => hasPendingToolApproval(message.data.parts ?? []))) {
    return 'awaiting-approval';
  }

  const executions = [...activeTurn.executions.values()];
  if (executions.length === 0) {
    return 'error';
  }
  if (executions.every((execution) => execution.status === 'aborted')) {
    return 'aborted';
  }
  if (executions.some((execution) => execution.status === 'error')) {
    return 'error';
  }
  return 'done';
}

/**
 * The rows a turn is about to write, in the shape the chat screen reads them.
 *
 * Ids come from the caller instead of the column default so the turn can be
 * published before it is persisted: the optimistic row and the row that lands
 * carry one identity, and `mergeMessagesWithOverlay` replaces in place instead
 * of appending a duplicate. Only DB-owned fields are guessed — the timestamps
 * (the real ones land milliseconds later, and nothing orders a turn by them)
 * and `searchableText`, which is a trigger's output no chat surface reads.
 */
function buildPendingTurnMessages(input: {
  messageSnapshots: readonly (MessageSnapshot | undefined)[];
  models: readonly Model[];
  newMessageId: () => string;
  parentId: string | null;
  parts: readonly CherryMessagePart[];
  siblingsGroupId: number;
  topicId: string;
  turnOptions: MessageData['turnOptions'];
  userSiblingsGroupId: number;
}): { placeholders: Message[]; userMessage: Message } {
  const now = new Date().toISOString();
  const dbOwnedFields = {
    createdAt: now,
    searchableText: '',
    topicId: input.topicId,
    updatedAt: now,
  };
  const userMessage: Message = {
    ...dbOwnedFields,
    data: { parts: [...input.parts] },
    id: input.newMessageId(),
    modelId: input.models[0]?.id ?? null,
    parentId: input.parentId,
    role: 'user',
    siblingsGroupId: input.userSiblingsGroupId,
    status: 'success',
  };
  const placeholders = input.models.map(
    (model, index): Message => ({
      ...dbOwnedFields,
      data: { parts: [], turnOptions: input.turnOptions },
      id: input.newMessageId(),
      messageSnapshot: input.messageSnapshots[index] ?? null,
      modelId: model.id,
      parentId: userMessage.id,
      role: 'assistant',
      siblingsGroupId: input.siblingsGroupId,
      status: 'pending',
    }),
  );

  return { placeholders, userMessage };
}

function buildStreamStatusSnapshot(turn: ActiveTurn): TopicStatusSnapshotEntry {
  const activeExecutions = [...turn.executions.values()]
    .filter((execution) => execution.status === 'streaming')
    .map((execution) => ({
      anchorMessageId: execution.assistantMessage.id,
      executionId: execution.model.id,
    }));
  const awaitingApprovalAnchors = [...turn.executions.values()]
    .filter((execution) => execution.pendingApprovalToolCallIds.size > 0)
    .map((execution) => ({
      anchorMessageId: execution.assistantMessage.id,
      executionId: execution.model.id,
    }));
  return {
    activeExecutions,
    awaitingApprovalAnchors,
    ...(turn.lastCompletedAt !== undefined ? { lastCompletedAt: turn.lastCompletedAt } : {}),
    status: turn.streamStatus,
    turnId: turn.turnId,
  };
}

function getFollowUpParts(payload: ChatFollowUpInput['payload']): CherryMessagePart[] {
  if (payload.userMessageParts.length > 0) {
    return [...payload.userMessageParts];
  }
  return payload.text ? ([{ type: 'text', text: payload.text }] as CherryMessagePart[]) : [];
}

function withSteerReminder(history: readonly Message[]): Message[] {
  const next = [...history];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const message = next[index];
    if (message.role !== 'user') continue;
    next[index] = {
      ...message,
      data: {
        ...message.data,
        parts: (message.data.parts ?? []).map((part) =>
          part.type === 'text' && part.text.trim()
            ? { ...part, text: wrapSteerReminder(part.text) }
            : part,
        ),
      },
    };
    break;
  }
  return next;
}

function syncPendingApprovalToolCallIds(
  execution: ActiveExecution,
  parts: readonly CherryMessagePart[],
): void {
  execution.pendingApprovalToolCallIds.clear();
  for (const part of parts) {
    if (isToolUIPart(part) && part.state === 'approval-requested') {
      execution.pendingApprovalToolCallIds.add(part.toolCallId);
    }
  }
}

function tapReadableStream<T>(
  source: ReadableStream<T>,
  onChunk: (chunk: T) => void,
): ReadableStream<T> {
  const reader = source.getReader();
  return new ReadableStream<T>({
    async pull(destination) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          destination.close();
          return;
        }
        onChunk(value);
        destination.enqueue(value);
      } catch (error) {
        destination.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

function captureApprovalTiming(
  collector: MessageRuntimeTimingCollector,
  parts: readonly CherryMessagePart[],
): void {
  for (const part of parts) {
    if (!isToolUIPart(part) || !part.approval?.id) continue;

    if (part.state === 'approval-requested') {
      const toolName =
        part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length);
      collector.startApproval(part.approval.id, part.toolCallId, toolName);
    } else {
      collector.finishApproval({ approvalId: part.approval.id });
    }
  }
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) {
    return;
  }

  throw signal.reason instanceof Error ? signal.reason : new Error('Chat stream aborted');
}

function getTurnParts(input: {
  parts?: readonly CherryMessagePart[];
  text: string;
}): CherryMessagePart[] {
  if (input.parts && input.parts.length > 0) {
    return [...input.parts] as CherryMessagePart[];
  }

  return input.text ? ([{ type: 'text', text: input.text }] as CherryMessagePart[]) : [];
}

function toErrorPart(error: unknown): CherryMessagePart {
  return {
    type: 'data-error',
    data: serializeError(error),
  } as CherryMessagePart;
}

function appendErrorPart(parts: readonly CherryMessagePart[], error: unknown): CherryMessagePart[] {
  if (parts[parts.length - 1]?.type === 'data-error') {
    return [...parts] as CherryMessagePart[];
  }

  return [...parts, toErrorPart(error)] as CherryMessagePart[];
}

function toModelSnapshot(model: Model): ModelSnapshot {
  return {
    id: model.apiModelId ?? model.modelId,
    name: model.name,
    provider: model.providerId,
  };
}

function toCherryUIMessage(message: Message): CherryUIMessage {
  return {
    id: message.id,
    parts: message.data.parts ?? [],
    role: message.role,
  } as CherryUIMessage;
}

function createTopicName(input: { parts: readonly CherryMessagePart[]; text: string }): string {
  const filePart = input.parts.find(
    (part): part is Extract<CherryMessagePart, { type: 'file' }> => part.type === 'file',
  );
  const title = input.text
    ? buildFirstUserMessageTitle(input.text)
    : sanitizeConversationTitle(filePart?.filename || 'New chat');

  return title.slice(0, 255);
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}
