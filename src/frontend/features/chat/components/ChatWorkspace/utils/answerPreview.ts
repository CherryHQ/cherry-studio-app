import { partitionMessageParts } from '@/frontend/components/Message/parts/partitionMessageParts';
import { resolveMessageCitations } from '@/frontend/utils/messageCitations';
import type { CherryMessagePart } from '@/shared/data/types/message';

/** Enough text to fill a folded card on any screen; the rest is never laid out there. */
export const ANSWER_PREVIEW_LENGTH = 1_200;

export type AnswerPreview = Readonly<{
  /** Non-whitespace characters in the whole answer, the length a reader would count. */
  length: number;
  /** The answer's opening text, cut on a character boundary. */
  text: string;
  isTruncated: boolean;
}>;

/**
 * An answer's text for a folded card: the result text the full answer shows outside its process,
 * with citation markers resolved the same way, cut to the preview length.
 */
export function answerPreview(parts: readonly CherryMessagePart[] | undefined): AnswerPreview {
  const all = parts ?? [];
  const { textByPartIndex } = resolveMessageCitations(all);
  const texts = partitionMessageParts(all).body.flatMap(({ index, part }) =>
    part.type === 'text'
      ? [textByPartIndex.get(index) ?? { markdown: part.text, plainText: part.text }]
      : [],
  );
  const text = texts.map((resolved) => resolved.markdown).join('\n\n');
  // Count and cut without materializing the answer as character arrays; the cut scans only the preview.
  let length = 0;
  for (const resolved of texts)
    for (const character of resolved.plainText) if (!/\s/.test(character)) length += 1;

  let end = 0;
  let characters = 0;
  for (const character of text) {
    if (characters === ANSWER_PREVIEW_LENGTH) break;
    end += character.length;
    characters += 1;
  }
  return {
    isTruncated: end < text.length,
    length,
    text: text.slice(0, end),
  };
}
