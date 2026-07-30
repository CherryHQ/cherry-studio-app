import { readUIMessageStream } from 'ai';

import { toCherryUIMessage } from '@/ai/messages/messageConverter';
import { serializeError } from '@/ai/utils/serializeError';
import { loggerService } from '@/core/logger/LoggerService';
import { discardPreparedFiles, prepareMessageParts } from '@/data/services/fileStorage';
import type {
  CherryMessagePart,
  CherryUIMessage,
  Message,
  ModelSnapshot,
} from '@/data/types/message';
import type { Model, UniqueModelId } from '@/data/types/model';
import { isUniqueModelId } from '@/data/types/model';
import type { Topic } from '@/data/types/topic';
import { type CherryReasoningMeta, readCherryMeta, withCherryMeta } from '@/data/types/uiParts';
import type { DataServices } from '@/runtime/createDataServices';

import {
  applyStreamingMessage,
  finalizeTurnToolApprovals,
  hasPendingToolApproval,
  hasUnresumedToolApproval,
  mergeMessageStats,
  statsFromMetadata,
} from './chatRuntimeMessages';
import { normalizeAssistantMessageCitations } from './normalizeCitations';
import { extractMainText, maybeRenameTopicFromConversationSummary } from './topicNaming';

export type ChatRuntimeTopicStatus =
  | 'aborting'
  | 'awaiting-approval'
  | 'idle'
  | 'reserving'
  | 'streaming';

export type ChatRuntimeTopicSnapshot = {
  error?: Error;
  /**
   * Whether the topic had content before the pending user turn. Defined only
   * while that turn is overlaid so initial rendering can distinguish a true
   * first exchange from an existing topic that is still streaming.
   */
  hasHistoryBeforePendingTurn?: boolean;
  overlayMessage?: Message;
  pendingUserMessage?: Message;
  status: ChatRuntimeTopicStatus;
};

export type ChatRuntimeSendTextInput = {
  assistantId?: string | null;
  parts?: readonly CherryMessagePart[];
  selectedModelId?: UniqueModelId | null;
  text: string;
  topicId: string;
};

export type ChatRuntimeSendNewTopicTextInput = {
  assistantId?: string | null;
  parts?: readonly CherryMessagePart[];
  selectedModelId?: UniqueModelId | null;
  text: string;
};

export type ChatRuntimeToolApprovalInput = {
  approvalId: string;
  approved: boolean;
  messageId: string;
  reason?: string;
  topicId: string;
  updatedInput?: Record<string, unknown>;
};

type ChatRuntimeDependencies = {
  invalidateTopicMessages: (topicId: string) => Promise<void>;
  invalidateTopics: () => Promise<void>;
  openTopic: (topicId: string) => void;
  services: DataServices;
};

type ActiveTurn = {
  abortController: AbortController;
};

export const newTopicRuntimeId = '__new_topic__';

const idleTopicSnapshot: ChatRuntimeTopicSnapshot = Object.freeze({ status: 'idle' });
const logger = loggerService.withContext('ChatRuntime');

/**
 * Fed back to the model as tool results (via `convertToModelMessages`), never
 * shown in the UI — fixed English text, no i18n.
 */
const interruptedTurnApprovalReason = 'The turn ended before this tool call completed.';

export class ChatRuntime {
  private activeTurns = new Map<string, ActiveTurn>();
  private listeners = new Set<() => void>();
  private newTopicHandoffTopicId: string | undefined;
  private topicSnapshots = new Map<string, ChatRuntimeTopicSnapshot>();

  constructor(private readonly dependencies: ChatRuntimeDependencies) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  getTopicSnapshot(topicId: string): ChatRuntimeTopicSnapshot {
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

  dispose(): void {
    for (const [topicId, activeTurn] of this.activeTurns) {
      activeTurn.abortController.abort(new Error('Chat runtime disposed'));
      this.setTopicSnapshot(topicId, idleTopicSnapshot);
    }

    this.activeTurns.clear();
    this.newTopicHandoffTopicId = undefined;
    this.setTopicSnapshot(newTopicRuntimeId, idleTopicSnapshot);
    this.listeners.clear();
  }

  async sendText(input: ChatRuntimeSendTextInput): Promise<void> {
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

  async sendNewTopicText(input: ChatRuntimeSendNewTopicTextInput): Promise<void> {
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
    if (this.activeTurns.has(newTopicRuntimeId)) {
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
    this.activeTurns.set(newTopicRuntimeId, activeTurn);
    this.setTopicSnapshot(newTopicRuntimeId, { status: 'reserving' });

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

      this.activeTurns.delete(newTopicRuntimeId);
      this.newTopicHandoffTopicId = topic.id;
      this.activeTurns.set(topic.id, activeTurn);
      this.setTurnSnapshot(topic.id, { status: 'reserving' });
      await this.dependencies.invalidateTopics();
      throwIfAborted(abortController.signal);
      this.dependencies.openTopic(topic.id);
      throwIfAborted(abortController.signal);

      await this.runTopicTurn({
        activeTurn,
        model,
        parts,
        topic,
      });
    } catch (error) {
      this.activeTurns.delete(newTopicRuntimeId);
      if (createdTopicId) {
        this.activeTurns.delete(createdTopicId);
        await this.invalidateTopicMessagesSafely(createdTopicId);
        this.setTopicSnapshot(createdTopicId, idleTopicSnapshot);
      }
      if (createdTopicId && this.newTopicHandoffTopicId === createdTopicId) {
        this.newTopicHandoffTopicId = undefined;
      }
      this.setTopicSnapshot(newTopicRuntimeId, idleTopicSnapshot);

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
  async respondToolApproval(input: ChatRuntimeToolApprovalInput): Promise<void> {
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

  private async runTopicTurn(input: {
    activeTurn: ActiveTurn;
    model: Model;
    parts: readonly CherryMessagePart[];
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
    let preparedFiles: Awaited<ReturnType<typeof prepareMessageParts>>['files'] = [];
    let turnParts = [...parts];
    let handedOffToStream = false;

    try {
      const prepared = await prepareMessageParts(parts);
      preparedFiles = prepared.files;
      turnParts = prepared.parts;
      const modelSnapshot = toModelSnapshot(model);
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
              modelSnapshot,
              parentId: topic.activeNodeId ?? null,
              role: 'user',
              status: 'success',
            },
          },
          placeholders: [
            {
              data: { parts: [] },
              modelId: model.id,
              modelSnapshot,
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
      await this.dependencies.invalidateTopicMessages(topicId);
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
        discardPreparedFiles(preparedFiles);
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
    terminalSnapshot?: ChatRuntimeTopicSnapshot;
    topicId: string;
  }): Promise<void> {
    const { activeTurn, topicId } = input;

    if (this.activeTurns.get(topicId) === activeTurn) {
      this.activeTurns.delete(topicId);
    }
    if (this.newTopicHandoffTopicId === topicId) {
      this.newTopicHandoffTopicId = undefined;
      this.setTopicSnapshot(newTopicRuntimeId, idleTopicSnapshot);
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
    topic: Topic;
  }): Promise<void> {
    const { activeTurn, assistantMessage, history, model, topic } = input;
    const topicId = topic.id;
    const { abortController } = activeTurn;
    let latestAssistantMessage: CherryUIMessage | undefined;
    let terminalAssistantMessage: Message | undefined;

    try {
      const stream = await this.dependencies.services.ai.streamText({
        assistantId: topic.assistantId,
        chatId: topicId,
        messageId: assistantMessage.id,
        messages: history.map(toCherryUIMessage),
        requestOptions: { signal: abortController.signal },
        trigger: 'submit-message',
        uniqueModelId: model.id,
      });
      throwIfAborted(abortController.signal);

      for await (const nextAssistantMessage of readUIMessageStream<CherryUIMessage>({
        message: toCherryUIMessage(assistantMessage),
        stream,
        terminateOnError: true,
      })) {
        latestAssistantMessage = nextAssistantMessage;
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
      terminalAssistantMessage = await this.persistSuccessfulAssistantMessage({
        assistantMessage,
        latestAssistantMessage,
      });

      if (!isAwaitingApproval && input.autoNameUserParts) {
        void this.autoNameTopicFromSummary({
          assistantId: topic.assistantId,
          assistantParts: (latestAssistantMessage?.parts ?? []) as CherryMessagePart[],
          defaultModelId: model.id,
          topicId,
          userParts: input.autoNameUserParts,
        });
      }
    } catch (error) {
      terminalAssistantMessage = await this.settleFailedTurn({
        assistantMessage,
        error,
        latestAssistantMessage,
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
    defaultModelId: UniqueModelId;
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
      defaultModelId: input.defaultModelId,
      services: this.dependencies.services,
      topicId: input.topicId,
      userText,
    });

    if (renamed) {
      await this.dependencies.invalidateTopics();
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      // One bad subscriber must not take the notification — or the teardown
      // that is often driving it — down with it.
      try {
        listener();
      } catch (error) {
        logger.error('Chat runtime listener failed', toError(error));
      }
    }
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
      await this.dependencies.invalidateTopicMessages(topicId);
    } catch (error) {
      logger.error('Failed to refresh messages after a turn ended', toError(error));
    }
  }

  private async persistFailedAssistantMessage(input: {
    assistantMessage: Message;
    error: unknown;
    latestAssistantMessage?: CherryUIMessage;
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
    const stats = mergeMessageStats(
      input.assistantMessage.stats,
      statsFromMetadata(input.latestAssistantMessage?.metadata),
    );

    return await this.dependencies.services.message.update(input.assistantMessage.id, {
      data: { parts: finalizeInterruptedReasoningParts(dataParts as CherryMessagePart[]) },
      ...(stats && { stats }),
      status: input.wasAborted ? 'paused' : 'error',
    });
  }

  private async persistSuccessfulAssistantMessage(input: {
    assistantMessage: Message;
    latestAssistantMessage?: CherryUIMessage;
  }): Promise<Message> {
    const normalizedMessage = input.latestAssistantMessage
      ? normalizeAssistantMessageCitations(input.latestAssistantMessage)
      : undefined;
    const parts = (normalizedMessage?.parts ??
      input.assistantMessage.data.parts ??
      []) as CherryMessagePart[];
    const stats = mergeMessageStats(
      input.assistantMessage.stats,
      statsFromMetadata(input.latestAssistantMessage?.metadata),
    );

    return await this.dependencies.services.message.update(input.assistantMessage.id, {
      data: { parts },
      ...(stats && { stats }),
      status: 'success',
    });
  }

  private async resolveTurnContext(input: ChatRuntimeSendTextInput) {
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
      await this.dependencies.invalidateTopics();
      await this.dependencies.invalidateTopicMessages(input.topicId);
    }

    const model = await this.resolveModel(input.selectedModelId, topic);

    return { model, topic };
  }

  private resolveRuntimeTopicId(topicId: string): string {
    if (topicId === newTopicRuntimeId && this.newTopicHandoffTopicId) {
      return this.newTopicHandoffTopicId;
    }

    return topicId;
  }

  private setTurnSnapshot(topicId: string, snapshot: ChatRuntimeTopicSnapshot): void {
    this.setTopicSnapshot(topicId, snapshot);

    if (this.newTopicHandoffTopicId === topicId) {
      this.setTopicSnapshot(newTopicRuntimeId, snapshot);
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

  private setTopicSnapshot(topicId: string, snapshot: ChatRuntimeTopicSnapshot): void {
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

    this.emit();
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

/**
 * A reasoning part can still be `state: 'streaming'` when a turn ends early
 * (abort, network error, app kill). Left as-is, ReasoningPart would treat it
 * as perpetually thinking on every future render. Force it to `done` and
 * backfill `thinkingMs` from `startedAt` when the stream never sent a
 * `reasoning-end` to compute it.
 */
function finalizeInterruptedReasoningParts(parts: CherryMessagePart[]): CherryMessagePart[] {
  return parts.map((part) => {
    if (part.type !== 'reasoning' || part.state !== 'streaming') {
      return part;
    }

    const cherry = readCherryMeta(part);
    const startedAt = cherry?.startedAt;
    const thinkingMs = cherry?.thinkingMs;
    const patch: Partial<CherryReasoningMeta> =
      typeof startedAt === 'number' && Number.isFinite(startedAt) && !Number.isFinite(thinkingMs)
        ? { thinkingMs: Math.max(0, Date.now() - startedAt) }
        : {};

    return withCherryMeta({ ...part, state: 'done' }, patch);
  });
}

function toModelSnapshot(model: Model): ModelSnapshot {
  return {
    id: model.apiModelId ?? model.modelId,
    name: model.name,
    provider: model.providerId,
  };
}

function createTopicName(input: { parts: readonly CherryMessagePart[]; text: string }): string {
  const filePart = input.parts.find(
    (part): part is Extract<CherryMessagePart, { type: 'file' }> => part.type === 'file',
  );
  const title = input.text || filePart?.filename || 'New chat';

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
