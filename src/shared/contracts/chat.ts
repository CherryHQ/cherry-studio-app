import type { ComposerQueuedMessagePayload } from '@cherrystudio/universal/ai/transport/stream';
import type { CherryMessagePart, Message } from '@cherrystudio/universal/data/types/message';
import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { ReasoningEffortOption } from '@cherrystudio/universal/types/aiSdk';

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

export type ChatSendMultiModelTextInput = Omit<ChatSendTextInput, 'selectedModelId'> & {
  selectedModelIds: readonly UniqueModelId[];
};

export type ChatRegenerateInput = {
  fastMode?: boolean;
  messageId: string;
  reasoningEffort?: ReasoningEffortOption;
  selectedModelIds?: readonly UniqueModelId[];
  topicId: string;
};

export type ChatEditAndResendInput = {
  fastMode?: boolean;
  messageId: string;
  parts?: readonly CherryMessagePart[];
  reasoningEffort?: ReasoningEffortOption;
  selectedModelIds?: readonly UniqueModelId[];
  text: string;
  topicId: string;
};

export type ChatSetActiveBranchInput = {
  throughNodeId: string;
  topicId: string;
};

export type ChatCancelExecutionInput = {
  executionId: UniqueModelId;
  topicId: string;
};

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
  cancelExecution(input: ChatCancelExecutionInput): void;
  editAndResend(input: ChatEditAndResendInput): Promise<void>;
  getTopicSnapshot(topicId: string): ChatTopicSnapshot;
  queueFollowUp(input: ChatFollowUpInput): Promise<void>;
  regenerate(input: ChatRegenerateInput): Promise<void>;
  respondToolApproval(input: ChatToolApprovalInput): Promise<void>;
  sendMultiModelText(input: ChatSendMultiModelTextInput): Promise<void>;
  sendNewTopicText(input: ChatSendNewTopicTextInput): Promise<void>;
  sendText(input: ChatSendTextInput): Promise<void>;
  setActiveBranch(input: ChatSetActiveBranchInput): Promise<void>;
  steer(input: ChatFollowUpInput): Promise<void>;
  subscribe(listener: ChatListener): () => void;
}
