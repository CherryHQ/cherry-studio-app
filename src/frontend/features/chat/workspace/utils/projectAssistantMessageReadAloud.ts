import type { MessageListItem } from '@/frontend/components/messages';

import { projectMarkdownInlineForSpeech } from './projectMarkdownInlineForSpeech';

export type AssistantReadAloudContent = { language?: string | null; text: string };

const COMPLEX_LATEX_COMMAND = /\\[a-z]+/iu;
const CODE_SPAN_MARKER = '\uE000';
const SPEAKABLE_CHARACTER = /[\p{L}\p{N}]/u;
const TRAILING_URL_PUNCTUATION = /[.,!?;:]/u;

type InlineLinkReadResult =
  | { end: number; type: 'literal' }
  | { end: number; isImage: boolean; label: string; type: 'link' };

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

  return source.language !== undefined ? { language: source.language, text } : { text };
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
  if (language && blocks.every((block) => block.language === language)) {
    return { language, text };
  }
  return blocks.some((block) => block.language) ? { language: null, text } : { text };
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
  text = text.replace(/\[cite:[^\]]+\]/giu, '');
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
  const runs: { end: number; length: number; start: number }[] = [];
  for (let index = 0; index < markdown.length;) {
    if (markdown[index] !== '`') {
      index += 1;
      continue;
    }

    let end = index + 1;
    while (markdown[end] === '`') {
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
    const content = markdown
      .slice(openingRun.end, closingRun.start)
      .replace(/\n/g, ' ')
      .replaceAll(CODE_SPAN_MARKER.repeat(2), CODE_SPAN_MARKER);
    const codeSpanIndex = codeSpans.push(content) - 1;
    output.push(markdown.slice(cursor, openingRun.start));
    output.push(`${CODE_SPAN_MARKER}${codeSpanIndex}${CODE_SPAN_MARKER}`);
    cursor = closingRun.end;
    index = closingRunIndex;
  }
  output.push(markdown.slice(cursor));
  return output.join('');
}

function projectMarkdownLinksForSpeech(markdown: string): string {
  const output: string[] = [];
  let index = 0;
  while (index < markdown.length) {
    const autolinkEnd = readHttpAutolinkEnd(markdown, index);
    if (autolinkEnd !== undefined) {
      index = autolinkEnd;
      continue;
    }

    const inlineLink = readInlineMarkdownLink(markdown, index);
    if (!inlineLink) {
      output.push(markdown[index]);
      index += 1;
      continue;
    }

    if (inlineLink.type === 'literal') {
      output.push(markdown.slice(index, inlineLink.end));
    } else if (!inlineLink.isImage && !/^\d+$/u.test(inlineLink.label)) {
      output.push(inlineLink.label);
    }
    index = inlineLink.end;
  }

  const projected = output
    .join('')
    .replace(/!\[[^\u005B\u005D]*\]\[[^\u005B\u005D]*\]/g, '')
    .replace(/\[([^\u005B\u005D]+)\]\[[^\u005B\u005D]*\]/g, '$1');
  return removeBareUrls(projected);
}

function readInlineMarkdownLink(markdown: string, start: number): InlineLinkReadResult | undefined {
  const isImage = markdown[start] === '!' && markdown[start + 1] === '[';
  if (!isImage && markdown[start] !== '[') {
    return undefined;
  }

  const label: string[] = [];
  let depth = 0;
  let index = start + (isImage ? 2 : 1);
  while (index < markdown.length && markdown[index] !== '\n') {
    const character = markdown[index];
    const escapedCharacter = markdown[index + 1];
    if (character === '\\' && isAsciiPunctuation(escapedCharacter)) {
      label.push(escapedCharacter);
      index += 2;
      continue;
    }
    if (character === '[') {
      depth += 1;
      label.push(character);
      index += 1;
      continue;
    }
    if (character !== ']') {
      label.push(character);
      index += 1;
      continue;
    }
    if (depth > 0) {
      depth -= 1;
      label.push(character);
      index += 1;
      continue;
    }

    const destinationMarker = index + 1;
    if (markdown[destinationMarker] !== '(') {
      return { end: destinationMarker, type: 'literal' };
    }
    const destinationStart = destinationMarker + 1;
    const destinationEnd = findInlineLinkDestinationEnd(markdown, destinationStart);
    return destinationEnd === undefined
      ? { end: findLineEnd(markdown, destinationStart), type: 'literal' }
      : { end: destinationEnd, isImage, label: label.join(''), type: 'link' };
  }

  return { end: findLineEnd(markdown, index), type: 'literal' };
}

function readHttpAutolinkEnd(markdown: string, start: number): number | undefined {
  if (markdown[start] !== '<' || !hasHttpUrlPrefix(markdown, start + 1)) {
    return undefined;
  }

  for (let index = start + 1; index < markdown.length; index += 1) {
    if (markdown[index] === '>') {
      return index + 1;
    }
    if (markdown[index] === CODE_SPAN_MARKER || /\s/u.test(markdown[index])) {
      return undefined;
    }
  }
  return undefined;
}

function findLineEnd(text: string, start: number): number {
  const lineEnd = text.indexOf('\n', start);
  return lineEnd === -1 ? text.length : lineEnd;
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
  if (!hasHttpUrlPrefix(text, start)) {
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

function hasHttpUrlPrefix(text: string, start: number): boolean {
  const prefix = text.slice(start, start + 8).toLowerCase();
  return prefix.startsWith('http://') || prefix.startsWith('https://');
}

function isAsciiPunctuation(character: string | undefined): character is string {
  if (character === undefined) {
    return false;
  }
  const codePoint = character.codePointAt(0) ?? 0;
  return (
    (codePoint >= 33 && codePoint <= 47) ||
    (codePoint >= 58 && codePoint <= 64) ||
    (codePoint >= 91 && codePoint <= 96) ||
    (codePoint >= 123 && codePoint <= 126)
  );
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
  const balance: Record<')' | ']' | '}', number> = { ')': 0, ']': 0, '}': 0 };
  for (const character of url) {
    if (character === '(') {
      balance[')'] += 1;
    } else if (character === '[') {
      balance[']'] += 1;
    } else if (character === '{') {
      balance['}'] += 1;
    } else if (character === ')' || character === ']' || character === '}') {
      balance[character] -= 1;
    }
  }

  let boundary = url.length;
  while (boundary > 0) {
    const character = url[boundary - 1];
    if (TRAILING_URL_PUNCTUATION.test(character)) {
      boundary -= 1;
    } else if (
      (character === ')' || character === ']' || character === '}') &&
      balance[character] < 0
    ) {
      balance[character] += 1;
      boundary -= 1;
    } else {
      break;
    }
  }
  return url.slice(boundary);
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
