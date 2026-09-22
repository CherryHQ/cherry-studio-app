// Accept fences inside quotes and lists as well as at the document root.
const CODE_FENCE = /^(?: {0,3}>[ \t]?)* {0,3}(?:(?:[-+*]|\d+[.)])[ \t]+)?(`{3,}|~{3,})(.*)$/;
const INDENTED_CODE = /^(?: {0,3}>[ \t]?)*(?: {4}|\t)/;

/** Adapt TeX delimiters to MD4C's dollar syntax without rewriting stored messages. */
export function normalizeLatexDelimiters(markdown: string, isStreaming = false): string {
  if (!markdown.includes('\\')) return markdown;

  const parts: string[] = [];
  let copiedUntil = 0;
  let index = 0;
  let fence = '';
  let inlineCodeLength = 0;

  while (index < markdown.length) {
    if (!inlineCodeLength && (index === 0 || markdown[index - 1] === '\n')) {
      const nextLine = markdown.indexOf('\n', index);
      const lineEnd = nextLine === -1 ? markdown.length : nextLine;
      const line = markdown.slice(index, lineEnd).replace(/\r$/, '');
      const match = CODE_FENCE.exec(line);

      if (fence) {
        if (
          match &&
          match[1][0] === fence[0] &&
          match[1].length >= fence.length &&
          !match[2].trim()
        ) {
          fence = '';
        }
        index = lineEnd + 1;
        continue;
      }

      if (match && (match[1][0] !== '`' || !match[2].includes('`'))) {
        fence = match[1];
        index = lineEnd + 1;
        continue;
      }

      if (INDENTED_CODE.test(line)) {
        index = lineEnd + 1;
        continue;
      }
    }

    const character = markdown[index];
    if (character === '`') {
      const end = runEnd(markdown, index);
      const length = end - index;
      if (!inlineCodeLength) inlineCodeLength = length;
      else if (inlineCodeLength === length) inlineCodeLength = 0;
      index = end;
      continue;
    }
    if (inlineCodeLength) {
      index += 1;
      continue;
    }

    // Existing dollar math owns its contents, including TeX backslashes.
    if (character === '$') {
      const end = runEnd(markdown, index);
      const delimiter = markdown.slice(index, end);
      const closing = delimiter.length <= 2 ? findClosingDelimiter(markdown, end, delimiter) : -1;
      index = closing === -1 ? end : closing + delimiter.length;
      continue;
    }

    if (character === '\\') {
      const next = markdown[index + 1];
      if (next === '(' || next === '[') {
        const closing = findClosingDelimiter(markdown, index + 2, next === '(' ? '\\)' : '\\]');
        if (closing === -1) {
          // Do not expose an unfinished formula to Markdown's heading/quote
          // rules. Holding this tail also keeps Streamdown's input append-only.
          if (isStreaming) return parts.join('') + markdown.slice(copiedUntil, index);
          break;
        }

        const delimiter = next === '(' ? '$' : '$$';
        // MD4C parses blocks before math spans. Physical newlines inside a
        // formula must not become headings, quotes, or paragraph boundaries;
        // TeX's explicit \\ row separators remain intact.
        const body = markdown.slice(index + 2, closing).replace(/\r\n?|\n/g, ' ');
        parts.push(markdown.slice(copiedUntil, index), delimiter, body, delimiter);
        index = closing + 2;
        copiedUntil = index;
        continue;
      }

      // A chunk can end between the backslash and its opening bracket.
      if (next === undefined && isStreaming) {
        return parts.join('') + markdown.slice(copiedUntil, index);
      }
      index += 2;
      continue;
    }

    index += 1;
  }

  return parts.length ? parts.join('') + markdown.slice(copiedUntil) : markdown;
}

function runEnd(text: string, start: number): number {
  let end = start + 1;
  while (text[end] === text[start]) end += 1;
  return end;
}

function findClosingDelimiter(text: string, start: number, delimiter: string): number {
  let index = start;
  while (index < text.length) {
    if (text.startsWith(delimiter, index)) {
      if (delimiter[0] !== '$' || text[index + delimiter.length] !== '$') return index;
    }
    if (text[index] === '\\') index += 2;
    else if (text[index] === '$') index = runEnd(text, index);
    else index += 1;
  }
  return -1;
}
