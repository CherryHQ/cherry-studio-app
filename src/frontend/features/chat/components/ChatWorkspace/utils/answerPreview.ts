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
  const characters = Array.from(text);
  return {
    isTruncated: characters.length > ANSWER_PREVIEW_LENGTH,
    length: Array.from(texts.map((resolved) => resolved.plainText).join('')).filter(
      (character) => !/\s/.test(character),
    ).length,
    text:
      characters.length > ANSWER_PREVIEW_LENGTH
        ? characters.slice(0, ANSWER_PREVIEW_LENGTH).join('')
        : text,
  };
}
