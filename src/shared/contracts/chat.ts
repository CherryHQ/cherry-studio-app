import type { CherryMessagePart, Message } from '@cherrystudio/universal/data/types/message';
import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { ReasoningEffortOption } from '@cherrystudio/universal/types/aiSdk';

export const NEW_TOPIC_SNAPSHOT_KEY = '__new_topic__';

export type ChatTopicStatus = 'aborting' | 'awaiting-approval' | 'idle' | 'reserving' | 'streaming';

export type ChatTopicSnapshot = {
  error?: Error;
  hasHistoryBeforePendingTurn?: boolean;
  overlayMessage?: Message;
  pendingUserMessage?: Message;
  status: ChatTopicStatus;
};

export type ChatSendTextInput = {
  assistantId?: string | null;
  fastMode?: boolean;
  parts?: readonly CherryMessagePart[];
  reasoningEffort?: ReasoningEffortOption;
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

export type ChatEvent =
  | { topicId: string; type: 'invalidate-topic-messages' }
  | { type: 'invalidate-topics' }
  | { topicId: string; type: 'open-topic' }
  | { topicId: string; type: 'snapshot-changed' };

export type ChatListener = (event: ChatEvent) => Promise<void> | void;

export interface ChatModule {
  abort(topicId: string): void;
  getTopicSnapshot(topicId: string): ChatTopicSnapshot;
  respondToolApproval(input: ChatToolApprovalInput): Promise<void>;
  sendNewTopicText(input: ChatSendNewTopicTextInput): Promise<void>;
  sendText(input: ChatSendTextInput): Promise<void>;
  subscribe(listener: ChatListener): () => void;
}
