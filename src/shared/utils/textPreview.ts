export const TEXT_PREVIEW_MAX_CHARACTERS = 8_192;
const TEXT_PREVIEW_MAX_LINES = 60;

/** Bounds both minified files and many short lines without scanning the full document. */
export function createTextPreview(text: string): { text: string; truncated: boolean } {
  const offset = Math.max(0, text.length - TEXT_PREVIEW_MAX_CHARACTERS);
  const tail = text.slice(offset);
  let start = 0;
  let position = tail.endsWith('\n') ? tail.length - 2 : tail.length - 1;
  for (let lines = 0; lines < TEXT_PREVIEW_MAX_LINES && position >= start; lines += 1) {
    const newline = tail.lastIndexOf('\n', position);
    if (newline < start) break;
    if (lines === TEXT_PREVIEW_MAX_LINES - 1) start = newline + 1;
    position = newline - 1;
  }
  const code = tail.charCodeAt(start);
  if (offset + start > 0 && code >= 0xdc00 && code <= 0xdfff) start += 1;
  return { text: tail.slice(start), truncated: offset + start > 0 };
}
