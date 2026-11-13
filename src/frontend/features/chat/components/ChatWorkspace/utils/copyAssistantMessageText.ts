import { createCodeBlockMarkdown } from '@cherrystudio/ui/markdown';

import { resolveMessageCitations } from '@/frontend/utils/messageCitations';
import type { CherryMessagePart } from '@/shared/data/types/message';

export function copyAssistantMessageText(parts: readonly CherryMessagePart[]): string {
  const citations = resolveMessageCitations(parts);
  return parts
    .map((part, index) => {
      switch (part.type) {
        case 'text':
          return citations.textByPartIndex.get(index)?.plainText ?? part.text;
        case 'data-code':
          return createCodeBlockMarkdown(part.data.content, part.data.language);
        case 'data-compact':
        case 'data-translation':
          return part.data.content;
        case 'data-error':
          return part.data.message ?? '';
        default:
          return '';
      }
    })
    .map((block) => block.trim())
    .filter(Boolean)
    .join('\n\n');
}
