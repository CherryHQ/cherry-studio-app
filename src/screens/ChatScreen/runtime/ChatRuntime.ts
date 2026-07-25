import { readUIMessageStream } from 'ai';

import { toCherryUIMessage } from '@/ai/messages/messageConverter';
import { serializeError } from '@/ai/utils/serializeError';
import { loggerService } from '@/core/logger/LoggerService';
import type { DataServices } from '@/data/services/createDataServices';
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

import { applyStreamingMessage, statsFromMetadata } from './chatRuntimeMessages';
import { normalizeAssistantMessageCitations } from './normalizeCitations';
import { extractMainText, maybeRenameTopicFromConversationSummary } from './topicNaming';

export type ChatRuntimeTopicStatus = 'aborting' | 'idle' | 'reserving' | 'streaming';

export type ChatRuntimeTopicSnapshot = {
  error?: Error;
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

type ChatRuntimeDependencies = {
  invalidateTopicMessages: (topicId: string) => Promise<void>;
  invalidateTopics: () => Promise<void>;
  openTopic: (topicId: string) => void;
  services: DataServices;
};

type ActiveTurn = {
  abortController: AbortController;
  assistantMessageId?: string;
};

export const newTopicRuntimeId = '__new_topic__';

const idleTopicSnapshot: ChatRuntimeTopicSnapshot = Object.freeze({ status: 'idle' });
const logger = loggerService.withContext('ChatRuntime');

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
      await this.dependencies.invalidateTopicMessages(input.topicId);
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
        await this.dependencies.invalidateTopicMessages(createdTopicId);
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

  private async runTopicTurn(input: {
    activeTurn: ActiveTurn;
    model: Model;
    parts: readonly CherryMessagePart[];
    topic: Topic;
  }): Promise<void> {
    const { activeTurn, model, parts, topic } = input;
    const topicId = topic.id;
    const { abortController } = activeTurn;
    let userMessage: Message | undefined;
    let assistantPlaceholder: Message | undefined;
    let latestAssistantMessage: CherryUIMessage | undefined;
    let terminalAssistantMessage: Message | undefined;
    let preparedFilesCommitted = false;
    let preparedFiles: Awaited<ReturnType<typeof prepareMessageParts>>['files'] = [];
    let turnParts = [...parts];

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
      activeTurn.assistantMessageId = assistantPlaceholder.id;
      throwIfAborted(abortController.signal);
      // Overlay the freshly created user message immediately so it renders
      // without waiting for the invalidate -> refetch round trip below.
      this.setTurnSnapshot(topicId, {
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
      const stream = await this.dependencies.services.ai.streamText({
        assistantId: topic.assistantId,
        chatId: topicId,
        messageId: assistantPlaceholder.id,
        messages: history.map(toCherryUIMessage),
        requestOptions: { signal: abortController.signal },
        trigger: 'submit-message',
        uniqueModelId: model.id,
      });
      throwIfAborted(abortController.signal);

      for await (const nextAssistantMessage of readUIMessageStream<CherryUIMessage>({
        message: toCherryUIMessage(assistantPlaceholder),
        stream,
        terminateOnError: true,
      })) {
        latestAssistantMessage = nextAssistantMessage;
        throwIfAborted(abortController.signal);
        this.setTurnSnapshot(topicId, {
          overlayMessage: applyStreamingMessage(assistantPlaceholder, nextAssistantMessage),
          pendingUserMessage: userMessage,
          status: 'streaming',
        });
      }

      throwIfAborted(abortController.signal);
      terminalAssistantMessage = await this.persistTerminalAssistantMessage({
        assistantPlaceholder,
        latestAssistantMessage,
        status: 'success',
      });

      if (isFirstExchange) {
        void this.autoNameTopicFromSummary({
          assistantId: topic.assistantId,
          assistantParts: (latestAssistantMessage?.parts ?? []) as CherryMessagePart[],
          defaultModelId: model.id,
          topicId,
          userParts: turnParts,
        });
      }
    } catch (error) {
      terminalAssistantMessage = await this.persistFailedAssistantMessage({
        assistantPlaceholder,
        error,
        latestAssistantMessage,
        wasAborted: abortController.signal.aborted,
      });

      if (!assistantPlaceholder && !abortController.signal.aborted) {
        throw toError(error);
      }

      if (!abortController.signal.aborted) {
        logger.warn('Chat stream failed', toError(error));
      }
    } finally {
      if (!preparedFilesCommitted) {
        discardPreparedFiles(preparedFiles);
      }

      if (terminalAssistantMessage) {
        this.setTurnSnapshot(topicId, {
          overlayMessage: terminalAssistantMessage,
          pendingUserMessage: userMessage,
          status: 'idle',
        });
      }

      await this.dependencies.invalidateTopicMessages(topicId);
      await waitForNextPaint();
      this.activeTurns.delete(topicId);
      this.setTurnSnapshot(topicId, idleTopicSnapshot);
      if (this.newTopicHandoffTopicId === topicId) {
        this.newTopicHandoffTopicId = undefined;
        this.setTopicSnapshot(newTopicRuntimeId, idleTopicSnapshot);
      }
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
      listener();
    }
  }

  private async persistFailedAssistantMessage(input: {
    assistantPlaceholder?: Message;
    error: unknown;
    latestAssistantMessage?: CherryUIMessage;
    wasAborted: boolean;
  }): Promise<Message | undefined> {
    const { assistantPlaceholder } = input;

    if (!assistantPlaceholder) {
      return;
    }

    const latestParts = input.latestAssistantMessage?.parts ?? [];
    const dataParts = input.wasAborted
      ? latestParts
      : appendErrorPart(latestParts as CherryMessagePart[], input.error);
    const stats = statsFromMetadata(input.latestAssistantMessage?.metadata);

    return await this.dependencies.services.message.update(assistantPlaceholder.id, {
      data: { parts: finalizeInterruptedReasoningParts(dataParts as CherryMessagePart[]) },
      ...(stats && { stats }),
      status: input.wasAborted ? 'paused' : 'error',
    });
  }

  private async persistTerminalAssistantMessage(input: {
    assistantPlaceholder: Message;
    latestAssistantMessage?: CherryUIMessage;
    status: 'paused' | 'success';
  }): Promise<Message> {
    const normalizedMessage =
      input.status === 'success' && input.latestAssistantMessage
        ? normalizeAssistantMessageCitations(input.latestAssistantMessage)
        : input.latestAssistantMessage;
    const parts = (normalizedMessage?.parts ?? []) as CherryMessagePart[];
    const stats = statsFromMetadata(input.latestAssistantMessage?.metadata);

    return await this.dependencies.services.message.update(input.assistantPlaceholder.id, {
      data: {
        parts: input.status === 'success' ? parts : finalizeInterruptedReasoningParts(parts),
      },
      ...(stats && { stats }),
      status: input.status,
    });
  }

  private async resolveTurnContext(input: ChatRuntimeSendTextInput) {
    let topic = await this.dependencies.services.topic.getById(input.topicId);

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
