import type { ConversationRef, TranscriptSnapshot } from '@/frontend/appShell/conversation';

import type { ChatShareTranslations } from './chatShareHandoff';

/** What sharing needs from a conversation: its address and an immutable selection read. */
export type ChatShareTarget = {
  ref: ConversationRef;
  translations?: ChatShareTranslations;
  prepareSelection(messageIds: readonly string[], signal: AbortSignal): Promise<TranscriptSnapshot>;
};
