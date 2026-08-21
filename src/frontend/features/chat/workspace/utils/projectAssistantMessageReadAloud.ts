import type { MessageListItem } from '@/frontend/components/messages';

import { projectMarkdownInlineForSpeech } from './projectMarkdownInlineForSpeech';

export type AssistantReadAloudContent = { language?: string; text: string };

const COMPLEX_LATEX_COMMAND = /\\[a-z]+/iu;
const CODE_SPAN_MARKER = '\uE000';
const SPEAKABLE_CHARACTER = /[\p{L}\p{N}]/u;

export function projectAssistantMessageReadAloud(
  message: MessageListItem,
): AssistantReadAloudContent | null {
  if (message.role !== 'assistant' || message.status !== 'success') {
    return null;
  }

  const source = projectSpeakableSource(message.data.parts ?? []);
  const text = cleanMarkdownForSpeech(source.text);

  if (!SPEAKABLE_CHARACTER.test(text)) {
    return null;
  }

  return source.language ? { language: source.language, text } : { text };
}

function projectSpeakableSource(
  parts: NonNullable<MessageListItem['data']['parts']>,
): AssistantReadAloudContent {
  let messageTranslation: AssistantReadAloudContent | undefined;
  for (const part of parts) {
    if (part.type === 'data-translation' && !part.data.sourceBlockId && part.data.content.trim()) {
      messageTranslation = { language: part.data.targetLanguage, text: part.data.content };
    }
  }
  if (messageTranslation) {
    return messageTranslation;
  }

  const blocks: AssistantReadAloudContent[] = [];
  for (const part of parts) {
    if (part.type === 'text') {
      blocks.push({ text: part.text });
    } else if (
      part.type === 'data-translation' &&
      part.data.sourceBlockId &&
      part.data.content.trim() &&
      blocks.length > 0
    ) {
      blocks[blocks.length - 1] = {
        language: part.data.targetLanguage,
        text: part.data.content,
      };
    }
  }

  const language = blocks[0]?.language;
  const text = blocks.map((block) => block.text).join('\n\n');
  return language && blocks.every((block) => block.language === language)
    ? { language, text }
    : { text };
}

function cleanMarkdownForSpeech(markdown: string): string {
  let text = markdown.replace(/\r\n?/g, '\n');
  text = removeCodeBlocks(text);

  const codeSpans: string[] = [];
  text = text.replaceAll(CODE_SPAN_MARKER, CODE_SPAN_MARKER.repeat(2));
  text = protectCodeSpans(text, codeSpans);

  text = text.replace(/\$\$[\s\S]*?(?:\$\$|$)/g, '');
  text = text.replace(/\\\[[\s\S]*?(?:\\\]|$)/g, '');
  text = projectMarkdownTables(text);

  text = projectMarkdownLinksForSpeech(text);
  text = text.replace(/\[(?:cite:[^\]]+|\d+)\]/giu, '');
  text = text.replace(/【\d+†[^】]*】/gu, '');

  text = text.replace(/\\\(([^\n]*?)\\\)/g, (_match, expression: string) =>
    isSimpleMath(expression) ? expression : '',
  );
  text = text.replace(/\$(?!\s)([^$\n]*?\S)\$/g, (_match, expression: string) =>
    isSimpleMath(expression) ? expression : '',
  );

  const withoutBlockMarkers = text.split('\n').map(removeBlockMarkers).join('\n');
  const projected = restoreCodeSpans(
    projectMarkdownInlineForSpeech(withoutBlockMarkers),
    codeSpans,
  );
  return normalizeSpeechWhitespace(projected);
}

function protectCodeSpans(markdown: string, codeSpans: string[]): string {
  return markdown
    .split('\n')
    .map((line) => protectCodeSpansOnLine(line, codeSpans))
    .join('\n');
}

function protectCodeSpansOnLine(line: string, codeSpans: string[]): string {
  const runs: { end: number; length: number; start: number }[] = [];
  for (let index = 0; index < line.length;) {
    if (line[index] !== '`') {
      index += 1;
      continue;
    }

    let end = index + 1;
    while (line[end] === '`') {
      end += 1;
    }
    runs.push({ end, length: end - index, start: index });
    index = end;
  }

  const nextRunByLength = new Map<number, number>();
  const closingRuns: (number | undefined)[] = Array.from({ length: runs.length });
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const run = runs[index];
    closingRuns[index] = nextRunByLength.get(run.length);
    nextRunByLength.set(run.length, index);
  }

  const output: string[] = [];
  let cursor = 0;
  for (let index = 0; index < runs.length; index += 1) {
    const openingRun = runs[index];
    if (openingRun.start < cursor) {
      continue;
    }

    const closingRunIndex = closingRuns[index];
    if (closingRunIndex === undefined) {
      continue;
    }

    const closingRun = runs[closingRunIndex];
    const content = line
      .slice(openingRun.end, closingRun.start)
      .replaceAll(CODE_SPAN_MARKER.repeat(2), CODE_SPAN_MARKER);
    const codeSpanIndex = codeSpans.push(content) - 1;
    output.push(line.slice(cursor, openingRun.start));
    output.push(`${CODE_SPAN_MARKER}${codeSpanIndex}${CODE_SPAN_MARKER}`);
    cursor = closingRun.end;
    index = closingRunIndex;
  }
  output.push(line.slice(cursor));
  return output.join('');
}

function projectMarkdownLinksForSpeech(markdown: string): string {
  const inlineLinkStart = /(!?)\[([^\u005B\u005D\n]*)\]\(/gu;
  const output: string[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = inlineLinkStart.exec(markdown)) !== null) {
    const destinationEnd = findInlineLinkDestinationEnd(markdown, inlineLinkStart.lastIndex);
    if (destinationEnd === undefined) {
      break;
    }

    output.push(markdown.slice(cursor, match.index));
    if (!match[1] && !/^\d+$/u.test(match[2])) {
      output.push(match[2]);
    }
    cursor = destinationEnd;
    inlineLinkStart.lastIndex = destinationEnd;
  }
  output.push(markdown.slice(cursor));

  const projected = output
    .join('')
    .replace(/!\[[^\u005B\u005D]*\]\[[^\u005B\u005D]*\]/g, '')
    .replace(/\[([^\u005B\u005D]+)\]\[[^\u005B\u005D]*\]/g, '$1');
  return removeBareUrls(projected);
}

function findInlineLinkDestinationEnd(markdown: string, start: number): number | undefined {
  let depth = 0;
  for (let index = start; index < markdown.length; index += 1) {
    if (markdown[index] === '\\') {
      index += 1;
    } else if (markdown[index] === '\n') {
      return undefined;
    } else if (markdown[index] === '(') {
      depth += 1;
    } else if (markdown[index] === ')') {
      if (depth === 0) {
        return index + 1;
      }
      depth -= 1;
    }
  }
  return undefined;
}

function removeBareUrls(text: string): string {
  const output: string[] = [];
  let index = 0;
  while (index < text.length) {
    const bareUrl = readBareUrl(text, index);
    if (!bareUrl) {
      output.push(text[index]);
      index += 1;
      continue;
    }
    output.push(bareUrl.trailingPunctuation);
    index = bareUrl.end;
  }
  return output.join('');
}

function readBareUrl(
  text: string,
  start: number,
): { end: number; trailingPunctuation: string } | undefined {
  const prefix = text.slice(start, start + 8).toLowerCase();
  if (!prefix.startsWith('http://') && !prefix.startsWith('https://')) {
    return undefined;
  }

  let end = start;
  while (end < text.length && text[end] !== CODE_SPAN_MARKER && !/[\s<>]/u.test(text[end])) {
    end += 1;
  }
  return {
    end,
    trailingPunctuation: preserveTrailingPunctuation(text.slice(start, end)),
  };
}

function removeCodeBlocks(markdown: string): string {
  const output: string[] = [];
  const listContentIndents: number[] = [];
  let openFence: { character: string; length: number } | undefined;

  for (const line of markdown.split('\n')) {
    const containerLine = removeBlockQuoteMarkers(line);
    const listMarker = parseListMarker(containerLine);
    const leadingIndent = countLeadingIndentColumns(containerLine);
    if (listMarker) {
      while ((listContentIndents.at(-1) ?? -1) > listMarker.markerIndent) {
        listContentIndents.pop();
      }
      listContentIndents.push(listMarker.contentIndent);
    } else if (containerLine.trim()) {
      while ((listContentIndents.at(-1) ?? -1) > leadingIndent) {
        listContentIndents.pop();
      }
    }

    const blockLine = removeBlockMarkers(line);
    const fence = blockLine.match(/^\s*(`{3,}|~{3,})/u)?.[1];
    if (!openFence) {
      if (fence) {
        openFence = { character: fence[0], length: fence.length };
      } else if (leadingIndent >= (listContentIndents.at(-1) ?? 0) + 4 && !listMarker) {
        continue;
      } else {
        output.push(line);
      }
      continue;
    }

    if (
      fence?.[0] === openFence.character &&
      fence.length >= openFence.length &&
      /^\s*(?:`+|~+)\s*$/u.test(blockLine)
    ) {
      openFence = undefined;
    }
  }

  return output.join('\n');
}

function removeBlockQuoteMarkers(line: string): string {
  let result = line;
  let marker = result.match(/^ {0,3}>\s?/u)?.[0];
  while (marker) {
    result = result.slice(marker.length);
    marker = result.match(/^ {0,3}>\s?/u)?.[0];
  }
  return result;
}

function parseListMarker(
  line: string,
): { contentIndent: number; markerIndent: number } | undefined {
  const match = line.match(/^( {0,3})([-+*]|\d{1,9}[.)])([ \t]+)/u);
  if (!match) {
    return undefined;
  }

  const markerIndent = countLeadingIndentColumns(match[1]);
  const markerEnd = markerIndent + match[2].length;
  const paddingEnd = countLeadingIndentColumns(match[3], markerEnd);
  const padding = paddingEnd - markerEnd;
  return {
    contentIndent: markerEnd + (padding <= 4 ? padding : 1),
    markerIndent,
  };
}

function countLeadingIndentColumns(text: string, initialColumn = 0): number {
  let column = initialColumn;
  for (const character of text) {
    if (character === ' ') {
      column += 1;
    } else if (character === '\t') {
      column += 4 - (column % 4);
    } else {
      break;
    }
  }
  return column;
}

function restoreCodeSpans(text: string, codeSpans: string[]): string {
  const output: string[] = [];
  let index = 0;

  while (index < text.length) {
    if (text[index] !== CODE_SPAN_MARKER) {
      output.push(text[index]);
      index += 1;
      continue;
    }
    if (text[index + 1] === CODE_SPAN_MARKER) {
      output.push(CODE_SPAN_MARKER);
      index += 2;
      continue;
    }

    const closingMarker = text.indexOf(CODE_SPAN_MARKER, index + 1);
    const codeSpanIndex = Number(text.slice(index + 1, closingMarker));
    output.push(codeSpans[codeSpanIndex]);
    index = closingMarker + 1;
  }

  return output.join('');
}

function projectMarkdownTables(markdown: string): string {
  const lines = markdown.split('\n');
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const header = parseTableRow(lines[index]);
    const separator = index + 1 < lines.length ? parseTableSeparator(lines[index + 1]) : false;
    if (!header || !separator) {
      output.push(lines[index]);
      continue;
    }

    const rows = [header];
    let nextIndex = index + 2;
    while (nextIndex < lines.length) {
      const row = parseTableRow(lines[nextIndex]);
      if (!row) {
        break;
      }
      rows.push(row);
      nextIndex += 1;
    }

    output.push(`${rows.map((row) => row.join(', ')).join('. ')}.`);
    index = nextIndex - 1;
  }

  return output.join('\n');
}

function parseTableRow(line: string): string[] | null {
  if (!line.includes('|')) {
    return null;
  }

  const row = line.trim().replace(/^\|/u, '').replace(/\|$/u, '');
  return row.split('|').map((cell) => cell.trim());
}

function parseTableSeparator(line: string): boolean {
  const cells = parseTableRow(line);
  return Boolean(cells?.length && cells.every((cell) => /^:?-{3,}:?$/u.test(cell)));
}

function preserveTrailingPunctuation(url: string): string {
  return url.match(/[.,!?;:)\]}]+$/u)?.[0] ?? '';
}

function isSimpleMath(expression: string): boolean {
  return !COMPLEX_LATEX_COMMAND.test(expression);
}

function removeBlockMarkers(line: string): string {
  let result = line;
  let previous: string;

  do {
    previous = result;
    result = result
      .replace(/^ {0,3}>\s?/u, '')
      .replace(/^ {0,3}#{1,6}(?:\s+|$)/u, '')
      .replace(/^\s*(?:[-+*]|\d+[.)])\s+/u, '');
  } while (result !== previous);

  return /^\s*(?:-{3,}|={3,}|\*{3,})\s*$/u.test(result) ? '' : result;
}

function normalizeSpeechWhitespace(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        .replace(/[\t ]+/g, ' ')
        .trim()
        .replace(/\s+([,.;!?])/gu, '$1'),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
