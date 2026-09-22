// Accept fences inside quotes and lists as well as at the document root.
const CODE_FENCE = /^(?: {0,3}>[ \t]?)* {0,3}(?:(?:[-+*]|\d+[.)])[ \t]+)?(`{3,}|~{3,})(.*)$/;
// A paragraph ends at the first blank line. Code spans and math spans cannot cross it.
const BLANK_LINE = /\n[ \t]*\r?\n/g;
// `\[1\]` is how Markdown escapes a citation bracket; only convert brackets that
// contain something a TeX formula needs.
const TEX_SIGNAL = /[\\^_={}+<>]/;

/**
 * Adapt TeX `\(...\)` and `\[...\]` delimiters to dollar math without rewriting
 * stored messages. Decisions never depend on text beyond the current paragraph,
 * and while streaming an undecidable tail is withheld, so every output is a
 * prefix of the next one.
 */
export function normalizeLatexDelimiters(markdown: string, isStreaming = false): string {
  if (!markdown.includes('\\')) return markdown;

  const parts: string[] = [];
  let copiedUntil = 0;
  let index = 0;
  let fence = '';
  let paragraphEnd = -1;
  // An unclosed backtick in the final paragraph may still become a code span.
  let pendingCodeSpan = false;

  while (index < markdown.length) {
    if (index === 0 || markdown[index - 1] === '\n') {
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
    }

    if (index >= paragraphEnd) {
      paragraphEnd = findParagraphEnd(markdown, index);
      pendingCodeSpan = false;
    }

    const character = markdown[index];
    if (character === '`') {
      const end = runEnd(markdown, index);
      const closing = findCodeSpanEnd(markdown, end, end - index, paragraphEnd);
      if (closing !== -1) {
        index = closing + (end - index);
        continue;
      }
      if (isStreaming && paragraphEnd === markdown.length) pendingCodeSpan = true;
      index = end;
      continue;
    }

    if (character === '\\') {
      const next = markdown[index + 1];
      if (next === '(' || next === '[') {
        const closing = findClosingDelimiter(
          markdown,
          index + 2,
          next === '(' ? '\\)' : '\\]',
          paragraphEnd,
        );
        // Streaming withholds the tail while a later chunk could still change
        // this formula, which keeps Streamdown's input append-only.
        const undecided = closing === -1 ? paragraphEnd === markdown.length : pendingCodeSpan;
        if (isStreaming && undecided) return parts.join('') + markdown.slice(copiedUntil, index);
        if (closing === -1) {
          index += 2;
          continue;
        }

        const body = formulaBody(markdown.slice(index + 2, closing));
        if (next === '[' && !TEX_SIGNAL.test(body)) {
          index += 2;
          continue;
        }

        const delimiter = next === '(' ? '$' : '$$';
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

function findParagraphEnd(text: string, from: number): number {
  BLANK_LINE.lastIndex = from;
  const match = BLANK_LINE.exec(text);
  return match ? match.index : text.length;
}

function runEnd(text: string, start: number): number {
  let end = start + 1;
  while (text[end] === text[start]) end += 1;
  return end;
}

function findCodeSpanEnd(text: string, start: number, length: number, limit: number): number {
  let index = start;
  while (index < limit) {
    if (text[index] === '`') {
      const end = runEnd(text, index);
      if (end - index === length) return index;
      index = end;
    } else {
      index += 1;
    }
  }
  return -1;
}

function findClosingDelimiter(
  text: string,
  start: number,
  delimiter: string,
  limit: number,
): number {
  let index = start;
  while (index < limit) {
    if (text.startsWith(delimiter, index)) return index;
    index += text[index] === '\\' ? 2 : 1;
  }
  return -1;
}

// MD4C parses blocks before math spans, so physical newlines inside a formula
// must not become headings, quotes, or paragraph boundaries. Joining lines
// would extend a TeX `%` comment over the rest of the formula, so comments go
// first. TeX's explicit `\\` row separators remain intact.
function formulaBody(source: string): string {
  return source
    .split(/\r\n?|\n/)
    .map((line) => {
      let index = 0;
      while (index < line.length && line[index] !== '%') {
        index += line[index] === '\\' ? 2 : 1;
      }
      return line.slice(0, index);
    })
    .join(' ');
}
