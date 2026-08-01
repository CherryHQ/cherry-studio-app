import type { PreparedInternalFile } from '@cherrystudio/universal/data/types/file';
import type {
  CherryMessagePart,
  CherryUIMessage,
  Message,
  MessageRuntimeStatsInput,
  MessageSnapshot,
  ModelSnapshot,
} from '@cherrystudio/universal/data/types/message';
import type { Model, UniqueModelId } from '@cherrystudio/universal/data/types/model';
import { isUniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Topic } from '@cherrystudio/universal/data/types/topic';
import {
  buildFirstUserMessageTitle,
  sanitizeConversationTitle,
} from '@cherrystudio/universal/utils/conversationTitle';
import { isToolUIPart } from 'ai';

import type {
  ChatSendNewTopicTextInput,
  ChatSendTextInput,
  ChatListener,
  ChatModule,
  ChatTopicSnapshot,
  ChatToolApprovalInput,
} from '@/shared/contracts';
import { NEW_TOPIC_SNAPSHOT_KEY } from '@/shared/contracts';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { serializeError } from '../utils/serializeError';
import type { ChatRuntimeDependencies } from './ChatRuntimeDependencies';
import {
  applyStreamingMessage,
  dropEmptyContentParts,
  finalizeInterruptedParts,
  finalizeTurnToolApprovals,
  hasPendingToolApproval,
  hasUnresumedToolApproval,
} from './chatRuntimeMessages';
import { MessageRuntimeTimingCollector } from './MessageRuntimeTimingCollector';
import { extractMainText, maybeRenameTopicFromConversationSummary } from './topicNaming';

type ActiveTurn = {
  abortController: AbortController;
};

const idleTopicSnapshot: ChatTopicSnapshot = Object.freeze({ status: 'idle' });
const logger = loggerService.withContext('ChatRuntime');

/**
 * Fed back to the model as tool results (via `convertToModelMessages`), never
 * shown in the UI — fixed English text, no i18n.
 */
const interruptedTurnApprovalReason = 'The turn ended before this tool call completed.';

export class ChatRuntime implements ChatModule {
  private activeTasks = new Set<Promise<unknown>>();
  private activeTurns = new Map<string, ActiveTurn>();
  private disposePromise: Promise<void> | undefined;
  private isDisposed = false;
  private listeners = new Set<ChatListener>();
  private newTopicHandoffTopicId: string | undefined;
  private topicSnapshots = new Map<string, ChatTopicSnapshot>();

  constructor(private readonly dependencies: ChatRuntimeDependencies) {}

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

    this.setTurnSnapshot(runtimeTopicId, {
      ...this.getTopicSnapshot(runtimeTopicId),
      status: 'aborting',
    });
    activeTurn.abortController.abort(new Error('Chat stream aborted'));
  }

  dispose(): Promise<void> {
    if (!this.disposePromise) {
      this.isDisposed = true;
      this.disposePromise = this.disposeRuntime();
    }

    return this.disposePromise;
  }

  sendText(input: ChatSendTextInput): Promise<void> {
    return this.startTask(() => this.sendTextTask(input));
  }

  sendNewTopicText(input: ChatSendNewTopicTextInput): Promise<void> {
    return this.startTask(() => this.sendNewTopicTextTask(input));
  }

  respondToolApproval(input: ChatToolApprovalInput): Promise<void> {
    return this.startTask(() => this.respondToolApprovalTask(input));
  }

  private async disposeRuntime(): Promise<void> {
    for (const activeTurn of this.activeTurns.values()) {
      activeTurn.abortController.abort(new Error('Chat runtime disposed'));
    }

    await Promise.allSettled([...this.activeTasks]);
    this.activeTasks.clear();
    this.activeTurns.clear();
    this.newTopicHandoffTopicId = undefined;
    this.topicSnapshots.clear();
    this.listeners.clear();
  }

  private async sendTextTask(input: ChatSendTextInput): Promise<void> {
    const text = input.text.trim();
    const parts = getTurnParts({ parts: input.parts, text });

    if (parts.length === 0) {
      return;
    }

    if (this.activeTurns.has(input.topicId)) {
      throw new Error('A response is already streaming for this topic.');
    }

    const abortController = new AbortController();
    const activeTurn: ActiveTurn = { abortController };
    this.activeTurns.set(input.topicId, activeTurn);
    this.setTopicSnapshot(input.topicId, { status: 'reserving' });

    try {
      const { model, topic } = await this.resolveTurnContext(input);
      throwIfAborted(abortController.signal);

      await this.runTopicTurn({
        activeTurn,
        model,
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

  private async sendNewTopicTextTask(input: ChatSendNewTopicTextInput): Promise<void> {
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
    const abortController = new AbortController();
    const activeTurn: ActiveTurn = { abortController };
    this.activeTurns.set(NEW_TOPIC_SNAPSHOT_KEY, activeTurn);
    this.setTopicSnapshot(NEW_TOPIC_SNAPSHOT_KEY, { status: 'reserving' });

    let createdTopicId: string | undefined;

    try {
      const model = await this.resolveModel(input.selectedModelId, {
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
      this.activeTurns.set(topic.id, activeTurn);
      this.setTurnSnapshot(topic.id, { status: 'reserving' });
      await this.emitAndWait({ type: 'invalidate-topics' });
      throwIfAborted(abortController.signal);
      await this.emitAndWait({ topicId: topic.id, type: 'open-topic' });
      throwIfAborted(abortController.signal);

      await this.runTopicTurn({
        activeTurn,
        model,
        parts,
        reasoningEffort: input.reasoningEffort,
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

    if (this.activeTurns.has(topicId)) {
      throw new Error('A response is already streaming for this topic.');
    }

    const abortController = new AbortController();
    const activeTurn: ActiveTurn = { abortController };
    this.activeTurns.set(topicId, activeTurn);
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
        throw new Error('The tool approval message no longer exists.');
      }

      if (applied.appliedApprovalIds.length === 0) {
        this.activeTurns.delete(topicId);
        const hasPendingApproval = hasPendingToolApproval(applied.parts);
        this.setTopicSnapshot(topicId, {
          status: hasPendingApproval ? 'awaiting-approval' : 'idle',
        });
        if (applied.alreadySettledApprovalIds.includes(input.approvalId)) {
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

    this.setTurnSnapshot(topic.id, {
      overlayMessage: message,
      status: 'streaming',
    });

    await this.streamAssistantTurn({
      activeTurn,
      assistantMessage: message,
      ...(autoNameUserParts ? { autoNameUserParts } : {}),
      history,
      model,
      reasoningEffort: message.data.turnOptions?.reasoningEffort,
      topic,
    });
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
    model: Model;
    parts: readonly CherryMessagePart[];
    reasoningEffort?: ChatSendTextInput['reasoningEffort'];
    topic: Topic;
  }): Promise<void> {
    const { activeTurn, model, parts, topic } = input;
    const topicId = topic.id;
    const hasHistoryBeforePendingTurn = Boolean(topic.activeNodeId);
    const { abortController } = activeTurn;
    let userMessage: Message | undefined;
    let assistantPlaceholder: Message | undefined;
    let terminalAssistantMessage: Message | undefined;
    let preparedFilesCommitted = false;
    let preparedFiles: PreparedInternalFile[] = [];
    let turnParts = [...parts];
    let handedOffToStream = false;

    try {
      const prepared = await this.dependencies.files.prepareParts(parts);
      preparedFiles = prepared.files;
      turnParts = prepared.parts;
      const messageSnapshot = await this.buildAssistantMessageSnapshot(model, topic);
      throwIfAborted(abortController.signal);
      const reservedTurn =
        await this.dependencies.services.message.createUserMessageWithPlaceholders({
          ...(preparedFiles.length > 0 ? { preparedFiles } : {}),
          topicId,
          userMessage: {
            mode: 'create',
            dto: {
              data: { parts: turnParts },
              modelId: model.id,
              parentId: topic.activeNodeId ?? null,
              role: 'user',
              status: 'success',
            },
          },
          placeholders: [
            {
              data: {
                parts: [],
                turnOptions: {
                  fastMode: false,
                  reasoningEffort: input.reasoningEffort,
                },
              },
              modelId: model.id,
              ...(messageSnapshot ? { messageSnapshot } : {}),
              role: 'assistant',
              status: 'pending',
            },
          ],
        });
      preparedFilesCommitted = true;
      if (abortController.signal.aborted) {
        await this.cancelReservedTurn({
          topicId,
          userMessageId: reservedTurn.userMessage.id,
        });
        return;
      }

      userMessage = reservedTurn.userMessage;
      assistantPlaceholder = reservedTurn.placeholders[0];
      throwIfAborted(abortController.signal);
      // Overlay the freshly created user message immediately so it renders
      // without waiting for the invalidate -> refetch round trip below.
      this.setTurnSnapshot(topicId, {
        hasHistoryBeforePendingTurn,
        overlayMessage: assistantPlaceholder,
        pendingUserMessage: userMessage,
        status: 'streaming',
      });
      await this.emitAndWait({ topicId, type: 'invalidate-topic-messages' });
      throwIfAborted(abortController.signal);

      const history = await this.dependencies.services.message.getPathToNode(
        reservedTurn.userMessage.id,
      );
      const isFirstExchange = history.length === 1;
      throwIfAborted(abortController.signal);

      handedOffToStream = true;
      await this.streamAssistantTurn({
        activeTurn,
        assistantMessage: assistantPlaceholder,
        ...(isFirstExchange ? { autoNameUserParts: turnParts } : {}),
        hasHistoryBeforePendingTurn,
        history,
        model,
        pendingUserMessage: userMessage,
        reasoningEffort: input.reasoningEffort,
        topic,
      });
    } catch (error) {
      // Past the handoff the stream owns the row: it has already persisted its
      // own terminal state and released the turn. Persisting again from here
      // would fall back to the placeholder's empty parts and overwrite
      // everything that streamed in.
      if (handedOffToStream) {
        logger.warn('Chat turn failed after the stream took over', toError(error));
      } else if (assistantPlaceholder) {
        terminalAssistantMessage = await this.settleFailedTurn({
          assistantMessage: assistantPlaceholder,
          error,
          wasAborted: abortController.signal.aborted,
        });

        if (!abortController.signal.aborted) {
          logger.warn('Chat stream failed', toError(error));
        }
      } else if (!abortController.signal.aborted) {
        throw toError(error);
      }
    } finally {
      if (!preparedFilesCommitted) {
        this.dependencies.files.discard(preparedFiles);
      }

      if (!handedOffToStream) {
        await this.releaseTurn({
          activeTurn,
          terminalSnapshot: terminalAssistantMessage && {
            overlayMessage: terminalAssistantMessage,
            pendingUserMessage: userMessage,
            status: 'idle',
          },
          topicId,
        });
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
    if (!this.activeTurns.has(topicId) && input.terminalSnapshot?.status !== 'awaiting-approval') {
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
   * Owns the turn teardown (terminal overlay, invalidate, activeTurns
   * release), so callers must not clean up again after it returns.
   */
  private async streamAssistantTurn(input: {
    activeTurn: ActiveTurn;
    assistantMessage: Message;
    autoNameUserParts?: readonly CherryMessagePart[];
    /** Rides with `pendingUserMessage`: only meaningful while it is overlaid. */
    hasHistoryBeforePendingTurn?: boolean;
    history: readonly Message[];
    model: Model;
    pendingUserMessage?: Message;
    reasoningEffort?: ChatSendTextInput['reasoningEffort'];
    topic: Topic;
  }): Promise<void> {
    const { activeTurn, assistantMessage, history, model, topic } = input;
    const topicId = topic.id;
    const { abortController } = activeTurn;
    let latestAssistantMessage: CherryUIMessage | undefined;
    let terminalAssistantMessage: Message | undefined;
    const runtimeTiming = new MessageRuntimeTimingCollector(assistantMessage.stats?.runtimeTiming);

    try {
      const stream = await this.dependencies.services.ai.streamText({
        assistantId: topic.assistantId,
        chatId: topicId,
        messageId: assistantMessage.id,
        messages: history.map(toCherryUIMessage),
        requestOptions: { signal: abortController.signal },
        reasoningEffort: input.reasoningEffort,
        runtimeTimingSink: runtimeTiming.sink,
        trigger: 'submit-message',
        uniqueModelId: model.id,
      });
      throwIfAborted(abortController.signal);

      for await (const nextAssistantMessage of this.dependencies.services.ai.readMessageStream({
        message: toCherryUIMessage(assistantMessage),
        stream,
      })) {
        latestAssistantMessage = nextAssistantMessage;
        captureApprovalTiming(runtimeTiming, nextAssistantMessage.parts as CherryMessagePart[]);
        throwIfAborted(abortController.signal);
        this.setTurnSnapshot(topicId, {
          hasHistoryBeforePendingTurn: input.hasHistoryBeforePendingTurn,
          overlayMessage: applyStreamingMessage(assistantMessage, nextAssistantMessage),
          pendingUserMessage: input.pendingUserMessage,
          status: 'streaming',
        });
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

      if (!abortController.signal.aborted) {
        logger.warn('Chat stream failed', toError(error));
      }
    } finally {
      await this.releaseTurn({
        activeTurn,
        terminalSnapshot: terminalAssistantMessage && {
          hasHistoryBeforePendingTurn: input.hasHistoryBeforePendingTurn,
          overlayMessage: terminalAssistantMessage,
          pendingUserMessage: input.pendingUserMessage,
          status: hasPendingToolApproval(terminalAssistantMessage.data.parts ?? [])
            ? 'awaiting-approval'
            : 'idle',
        },
        topicId,
      });
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

    const model = await this.resolveModel(input.selectedModelId, topic);

    return { model, topic };
  }

  private resolveRuntimeTopicId(topicId: string): string {
    if (topicId === NEW_TOPIC_SNAPSHOT_KEY && this.newTopicHandoffTopicId) {
      return this.newTopicHandoffTopicId;
    }

    return topicId;
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

  private async resolveModelId(
    selectedModelId?: UniqueModelId | null,
    topic?: Pick<Topic, 'assistantId'>,
  ) {
    if (selectedModelId) {
      return selectedModelId;
    }

    if (topic?.assistantId) {
      const assistant = await this.dependencies.services.assistant.getById(topic.assistantId);

      if (assistant.modelId) {
        return assistant.modelId;
      }
    }

    const defaultModelId = await this.dependencies.services.preference.get('chat.default_model_id');

    if (!isUniqueModelId(defaultModelId)) {
      throw new Error('No default model configured.');
    }

    return defaultModelId;
  }

  private setTopicSnapshot(topicId: string, snapshot: ChatTopicSnapshot): void {
    if (
      snapshot.status === 'idle' &&
      !snapshot.overlayMessage &&
      !snapshot.pendingUserMessage &&
      !snapshot.error
    ) {
      this.topicSnapshots.delete(topicId);
    } else {
      this.topicSnapshots.set(topicId, snapshot);
    }

    this.emit({ topicId, type: 'snapshot-changed' });
  }

  private startTask(run: () => Promise<void>): Promise<void> {
    if (this.isDisposed) {
      return Promise.reject(new Error('Chat runtime is disposed.'));
    }

    const task = run();
    this.trackTask(task);
    return task;
  }

  private trackTask(task: Promise<unknown>): void {
    this.activeTasks.add(task);
    void task.then(
      () => this.activeTasks.delete(task),
      () => this.activeTasks.delete(task),
    );
  }
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
