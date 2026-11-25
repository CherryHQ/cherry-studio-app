import { selectAssistantBodyTextParts } from '@/frontend/components/Message/body';
import { stripMessageCitations, type CitationSource } from '@/frontend/utils/messageCitations';
import type { CherryMessagePart } from '@/shared/data/types/message';
import { speakableText } from '@/shared/utils/speechText';

export function speechAssistantMessageText(
  parts: readonly CherryMessagePart[],
  sources?: readonly CitationSource[],
): string {
  const { parts: normalizedParts, bodyTextParts } = selectAssistantBodyTextParts(parts);
  if (bodyTextParts.length === 0) return '';
  const textByPartIndex = stripMessageCitations(
    normalizedParts,
    sources,
    new Set(bodyTextParts.map(({ index }) => index)),
  );
  return speakableText(
    bodyTextParts.map(({ index, part }) => textByPartIndex.get(index) ?? part.text).join('\n\n'),
  );
}
