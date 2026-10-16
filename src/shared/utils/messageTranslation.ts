import type { AgentMessagePart } from '@/shared/contracts/agent';
import type { CherryMessagePart } from '@/shared/data/types/message';

import { createCodeBlockMarkdown } from './createCodeBlockMarkdown';

/** Only answer text and code belong to the translation source. */
export function messageTranslationText(
  parts: readonly (AgentMessagePart | CherryMessagePart)[],
): string | undefined {
  if (!parts.some((part) => part.type === 'text' && part.text.trim())) return undefined;
  return parts
    .flatMap((part) => {
      if (part.type === 'text') return [part.text];
      if (part.type === 'data-code')
        return [createCodeBlockMarkdown(part.data.content, part.data.language)];
      return [];
    })
    .join('\n\n')
    .trim();
}
