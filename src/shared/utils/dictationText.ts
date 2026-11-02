// Scripts written without spaces between words or sentences.
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-￯]/u;

/**
 * Appends a recognized utterance. Recognizers emit each utterance separately and some prefix a
 * space; Chinese and Japanese text must not gain spaces between utterances.
 */
export function appendUtterance(text: string, utterance: string): string {
  const next = utterance.trim();
  if (!next) return text;
  if (!text) return next;
  const joint = UNSPACED.test(text.at(-1)!) || UNSPACED.test(next[0]!) ? '' : ' ';
  return `${text}${joint}${next}`;
}
