import type { BranchMessagesQueryParams } from '@/shared/data/api/schemas/messages';
import type {
  BranchMessagesResponse,
  CherryMessagePart,
  Message,
} from '@/shared/data/types/message';
import type { UniqueModelId } from '@/shared/data/types/model';

export const NEW_CHAT_SESSION_TOPIC_ID = '__new_topic__';

export type ChatSessionTopicStatus =
  | 'aborting'
  | 'awaiting-approval'
  | 'idle'
  | 'reserving'
  | 'streaming';

export type ChatSessionTopicSnapshot = {
  error?: Error;
  hasHistoryBeforePendingTurn?: boolean;
  overlayMessage?: Message;
  pendingUserMessage?: Message;
  status: ChatSessionTopicStatus;
};

export type ChatSendTextInput = {
  assistantId?: string | null;
  parts?: readonly CherryMessagePart[];
  selectedModelId?: UniqueModelId | null;
  text: string;
  topicId: string;
};

export type ChatSendNewTopicTextInput = Omit<ChatSendTextInput, 'topicId'>;

export type ChatToolApprovalInput = {
  approvalId: string;
  approved: boolean;
  messageId: string;
  reason?: string;
  topicId: string;
  updatedInput?: Record<string, unknown>;
};

export type ChatSessionEvent =
  | { topicId: string; type: 'invalidate-topic-messages' }
  | { type: 'invalidate-topics' }
  | { topicId: string; type: 'open-topic' }
  | { topicId: string; type: 'snapshot-changed' };

export type ChatSessionListener = (event: ChatSessionEvent) => Promise<void> | void;

export interface ChatSession {
  abort(topicId: string): void;
  dispose(): void;
  getTopicSnapshot(topicId: string): ChatSessionTopicSnapshot;
  respondToolApproval(input: ChatToolApprovalInput): Promise<void>;
  sendNewTopicText(input: ChatSendNewTopicTextInput): Promise<void>;
  sendText(input: ChatSendTextInput): Promise<void>;
  subscribe(listener: ChatSessionListener): () => void;
}

export interface ChatBackend {
  createSession(): ChatSession;
  listMessagePage(
    topicId: string,
    query?: BranchMessagesQueryParams,
  ): Promise<BranchMessagesResponse>;
}
