import type {
  ComposerQueuedMessagePayload,
  TopicStatusSnapshotEntry,
} from '@cherrystudio/universal/ai/transport';
import type { ReasoningEffortOption } from '@cherrystudio/universal/types/aiSdk';

import type { CherryMessagePart, Message } from '@/shared/data/types/message';
import type { UniqueModelId } from '@/shared/data/types/model';

export const NEW_TOPIC_SNAPSHOT_KEY = '__new_topic__';

export type ChatTopicStatus = 'aborting' | 'awaiting-approval' | 'idle' | 'reserving' | 'streaming';

export type ChatTopicSnapshot = {
  error?: Error;
  hasHistoryBeforePendingTurn?: boolean;
  overlayMessage?: Message;
  overlayMessages?: readonly Message[];
  pendingUserMessage?: Message;
  queuedMessages?: readonly ComposerQueuedMessagePayload[];
  status: ChatTopicStatus;
  stream?: TopicStatusSnapshotEntry;
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

export type ChatFollowUpInput = {
  payload: ComposerQueuedMessagePayload;
  topicId: string;
};

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
  queueFollowUp(input: ChatFollowUpInput): Promise<void>;
  respondToolApproval(input: ChatToolApprovalInput): Promise<void>;
  sendNewTopicText(input: ChatSendNewTopicTextInput): Promise<void>;
  sendText(input: ChatSendTextInput): Promise<void>;
  steer(input: ChatFollowUpInput): Promise<void>;
  subscribe(listener: ChatListener): () => void;
}
