import type { ChatToolApprovalInput } from '@/shared/contracts';
import type {
  BranchMessagesQueryParams,
  CreateMessageDto,
} from '@cherrystudio/shared/data/api/schemas/messages';
import type { CreateTopicDto, UpdateTopicDto } from '@cherrystudio/shared/data/api/schemas/topics';
import type { Assistant } from '@cherrystudio/shared/data/types/assistant';
import type { PreparedInternalFile } from '@cherrystudio/shared/data/types/file';
import type {
  BranchMessagesResponse,
  CherryMessagePart,
  CherryUIMessage,
  Message,
  MessageData,
  MessageRuntimeStatsInput,
  MessageRuntimeTimingSink,
} from '@cherrystudio/shared/data/types/message';
import type { Model, UniqueModelId } from '@cherrystudio/shared/data/types/model';
import type { Provider } from '@cherrystudio/shared/data/types/provider';
import type { Topic } from '@cherrystudio/shared/data/types/topic';
import type { ReasoningEffortOption } from '@cherrystudio/shared/types/aiSdk';

export type ChatStreamRequest = {
  assistantId?: string;
  chatId: string;
  messageId: string;
  messages: CherryUIMessage[];
  requestOptions: { signal: AbortSignal };
  reasoningEffort?: ReasoningEffortOption;
  runtimeTimingSink?: MessageRuntimeTimingSink;
  trigger: 'submit-message';
  uniqueModelId: UniqueModelId;
};

type ApprovalDecision = Omit<ChatToolApprovalInput, 'messageId' | 'topicId'>;

type CreateTurnInput = {
  placeholders: Omit<CreateMessageDto, 'parentId' | 'setAsActive' | 'siblingsGroupId'>[];
  preparedFiles?: readonly PreparedInternalFile[];
  topicId: string;
  userMessage: { dto: CreateMessageDto; mode: 'create' };
};

export type ChatSessionServices = {
  ai: {
    generateText(input: {
      assistantId?: string;
      prompt: string;
      system: string;
      uniqueModelId: UniqueModelId;
    }): Promise<{ text: string }>;
    readMessageStream(input: {
      message: CherryUIMessage;
      stream: unknown;
    }): AsyncIterable<CherryUIMessage>;
    streamText(input: ChatStreamRequest): Promise<unknown>;
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
    getPathToNode(id: string): Promise<Message[]>;
    finalizeAssistantMessage(
      id: string,
      input: {
        data: MessageData;
        status: Extract<Message['status'], 'success' | 'paused' | 'error'>;
        runtimeStats?: MessageRuntimeStatsInput;
      },
    ): Promise<Message>;
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
    update(id: string, input: UpdateTopicDto): Promise<Topic>;
  };
};

export type ChatSessionDependencies = {
  files: {
    discard(files: readonly PreparedInternalFile[]): void;
    prepareParts(
      parts: readonly CherryMessagePart[],
    ): Promise<{ files: PreparedInternalFile[]; parts: CherryMessagePart[] }>;
  };
  services: ChatSessionServices;
};
