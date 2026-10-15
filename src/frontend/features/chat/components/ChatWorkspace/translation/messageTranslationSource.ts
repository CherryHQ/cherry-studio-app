import type { MessageListItem } from '@/frontend/components/Message';
import { createCodeBlockMarkdown } from '@/frontend/utils/createCodeBlockMarkdown';
import { sha256HexOfText } from '@/shared/utils/sha256';

export type MessageTranslationSource = { messageId: string; contentHash: string; text: string };

/** Only the finished answer is translated, never reasoning, tool output or existing translations. */
export function messageTranslationSource(
  message: MessageListItem,
): MessageTranslationSource | undefined {
  if (message.role !== 'assistant' || message.status !== 'success') return undefined;
  const parts = message.data.parts ?? [];
  if (!parts.some((part) => part.type === 'text' && part.text.trim())) return undefined;
  const text = parts
    .flatMap((part) => {
      if (part.type === 'text') return [part.text];
      if (part.type === 'data-code')
        return [createCodeBlockMarkdown(part.data.content, part.data.language)];
      return [];
    })
    .join('\n\n')
    .trim();
  return { messageId: message.id, contentHash: sha256HexOfText(text), text };
}
