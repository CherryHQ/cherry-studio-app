import type { ConversationRef, TranscriptSnapshot } from '@/frontend/appShell/conversation';
import type { AppLanguage } from '@/shared/utils/languages';

export type ChatShareTranslations = Readonly<
  Record<
    string,
    {
      readonly revision?: string;
      readonly sourceHash: string;
      readonly language: AppLanguage;
      readonly content: string;
    }
  >
>;

/** What sharing needs from a conversation: its address and an immutable selection read. */
export type ChatShareTarget = {
  ref: ConversationRef;
  translations?: ChatShareTranslations;
  /** Current conversation path, including history outside the mounted transcript window. */
  readSelectableIds(signal: AbortSignal): Promise<readonly string[]>;
  prepareSelection(messageIds: readonly string[], signal: AbortSignal): Promise<TranscriptSnapshot>;
};
