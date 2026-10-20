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

/** An answer's text for a folded card: its text parts in order, cut to the preview length. */
export function answerPreview(parts: readonly CherryMessagePart[] | undefined): AnswerPreview {
  const text = (parts ?? [])
    .flatMap((part) => (part.type === 'text' && part.text.trim() ? [part.text] : []))
    .join('\n\n');
  const characters = Array.from(text);
  return {
    isTruncated: characters.length > ANSWER_PREVIEW_LENGTH,
    length: characters.filter((character) => !/\s/.test(character)).length,
    text:
      characters.length > ANSWER_PREVIEW_LENGTH
        ? characters.slice(0, ANSWER_PREVIEW_LENGTH).join('')
        : text,
  };
}
