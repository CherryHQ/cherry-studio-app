import type { MessageListItem } from '@/frontend/components/Message';
import type { MessageTranslations } from '@/shared/data/types/messageTranslation';
import { messageTranslationText } from '@/shared/utils/messageTranslation';
import { sha256HexOfText } from '@/shared/utils/sha256';

export type MessageTranslationSource = {
  messageId: string;
  contentHash: string;
  text: string;
  translations?: MessageTranslations;
};

/** Only the finished answer is translated, never reasoning, tool output or existing translations. */
export function messageTranslationSource(
  message: MessageListItem,
): MessageTranslationSource | undefined {
  if (message.role !== 'assistant' || message.status !== 'success') return undefined;
  const text = messageTranslationText(message.data.parts ?? []);
  if (!text) return undefined;
  return {
    messageId: message.id,
    contentHash: sha256HexOfText(text),
    text,
    translations: message.data.translations,
  };
}
