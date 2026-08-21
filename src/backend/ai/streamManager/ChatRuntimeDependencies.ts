import type { ReasoningEffortOption } from '@cherrystudio/universal/types/aiSdk';
import type { UIMessageChunk } from 'ai';

import type { BackgroundReplyLifecycle } from '@/backend/services/backgroundReply';
import type { ChatToolApprovalInput } from '@/shared/contracts';
import type {
  BranchMessagesQueryParams,
  CreateMessageDto,
} from '@/shared/data/api/schemas/messages';
import type { BranchMessagesResponse } from '@/shared/data/api/schemas/messages';
import type { CreateTopicDto, UpdateTopicDto } from '@/shared/data/api/schemas/topics';
import type { Assistant } from '@/shared/data/types/assistant';
import type { FileEntry } from '@/shared/data/types/file';
import type {
  CherryMessagePart,
  CherryUIMessage,
  Message,
  MessageData,
  MessageRuntimeStatsInput,
  MessageRuntimeTimingSink,
} from '@/shared/data/types/message';
import type { Model, UniqueModelId } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';
import type { Topic } from '@/shared/data/types/topic';

export type ChatStreamRequest = {
  assistantId?: string;
  chatId: string;
  fastMode?: boolean;
  messageId: string;
  messages: CherryUIMessage[];
  requestOptions: { signal: AbortSignal };
  reasoningEffort?: ReasoningEffortOption;
  runtimeTimingSink?: MessageRuntimeTimingSink;
  shouldYield?: () => boolean;
  trigger: 'submit-message';
  uniqueModelId: UniqueModelId;
};

type ApprovalDecision = Omit<ChatToolApprovalInput, 'messageId' | 'topicId'>;

/**
 * `id` is optional and caller-supplied: the runtime mints message ids before
 * the write so it can publish the turn ahead of persistence, and the row that
 * lands must carry the same identity the UI is already rendering.
 */
type CreateTurnPlaceholder = Omit<
  CreateMessageDto,
  'parentId' | 'setAsActive' | 'siblingsGroupId'
> & {
  id?: string;
};

type CreateTurnInput = {
  placeholders: CreateTurnPlaceholder[];
  siblingsGroupId?: number;
  topicId: string;
  userMessage:
    | { dto: CreateMessageDto; id?: string; mode: 'create' }
    | { id: string; mode: 'existing' };
};

export type ChatRuntimeServices = {
  ai: {
    generateText(input: {
      assistantId?: string;
      prompt: string;
      system: string;
      uniqueModelId: UniqueModelId;
    }): Promise<{ text: string }>;
    readMessageStream(input: {
      message: CherryUIMessage;
      stream: ReadableStream<UIMessageChunk>;
    }): AsyncIterable<CherryUIMessage>;
    streamText(input: ChatStreamRequest): Promise<ReadableStream<UIMessageChunk>>;
  };
  assistant: {
    getById(id: string): Promise<Assistant>;
  };
  message: {
    applyToolApprovalDecisions(
      id: string,
      decisions: ApprovalDecision[],
    ): Promise<{
      alreadySettledApprovalIds: string[];
      appliedApprovalIds: string[];
      parts: CherryMessagePart[];
    } | null>;
    createUserMessageWithPlaceholders(
      input: CreateTurnInput,
    ): Promise<{ placeholders: Message[]; userMessage: Message }>;
    delete(id: string, cascade: boolean, activeNodeStrategy: 'parent'): Promise<unknown>;
    getBranchMessages(
      topicId: string,
      query?: BranchMessagesQueryParams,
    ): Promise<BranchMessagesResponse>;
    getById(id: string): Promise<Message>;
    getChildrenByParentId(parentId: string): Promise<Message[]>;
    getPathToNode(id: string): Promise<Message[]>;
    getPathThrough(topicId: string, nodeId: string): Promise<Message[]>;
    newMessageId(): string;
    finalizeAssistantMessage(
      id: string,
      input: {
        data: MessageData;
        status: Extract<Message['status'], 'success' | 'paused' | 'error'>;
        runtimeStats?: MessageRuntimeStatsInput;
      },
    ): Promise<Message>;
    updateSiblingsGroupId(id: string, siblingsGroupId: number): Promise<void>;
  };
  model: {
    getById(id: string): Promise<Model | null>;
  };
  preference: {
    get(key: 'app.language'): Promise<string>;
    get(key: 'chat.default_model_id'): Promise<string>;
    get(key: 'topic.naming.enabled'): Promise<boolean>;
    get(key: 'topic.naming.model_id'): Promise<string>;
    get(key: 'topic.naming_prompt'): Promise<string>;
  };
  provider: {
    getByProviderId(id: string): Promise<Provider>;
  };
  topic: {
    create(input: CreateTopicDto): Promise<Topic>;
    getById(id: string): Promise<Topic>;
    setActiveNode(topicId: string, nodeId: string): Promise<{ activeNodeId: string }>;
    update(id: string, input: UpdateTopicDto): Promise<Topic>;
  };
};

export type ChatRuntimeDependencies = {
  backgroundReply: BackgroundReplyLifecycle;
  files: {
    createParts(
      parts: readonly CherryMessagePart[],
    ): Promise<{ entries: FileEntry[]; parts: CherryMessagePart[] }>;
    discard(entries: readonly FileEntry[]): Promise<void>;
  };
  services: ChatRuntimeServices;
};
