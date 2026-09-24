import type { ConversationRef, TranscriptSnapshot } from '@/frontend/appShell/conversation';

/** What sharing needs from a conversation: its address and an immutable selection read. */
export type ChatShareTarget = {
  ref: ConversationRef;
  prepareSelection(messageIds: readonly string[], signal: AbortSignal): Promise<TranscriptSnapshot>;
};
