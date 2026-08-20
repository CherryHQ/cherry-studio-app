import type { MessageListItem } from '@/frontend/components/messages';

import { projectMarkdownInlineForSpeech } from './projectMarkdownInlineForSpeech';

export type AssistantReadAloudContent = { language?: string; text: string };

const COMPLEX_LATEX_COMMAND = /\\[a-z]+/iu;
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

  const blocks: string[] = [];
  let language: string | undefined;
  for (const part of parts) {
    if (part.type === 'text') {
      blocks.push(part.text);
    } else if (
      part.type === 'data-translation' &&
      part.data.sourceBlockId &&
      part.data.content.trim() &&
      blocks.length > 0
    ) {
      blocks[blocks.length - 1] = part.data.content;
      language = part.data.targetLanguage;
    }
  }

  return language ? { language, text: blocks.join('\n\n') } : { text: blocks.join('\n\n') };
}

function cleanMarkdownForSpeech(markdown: string): string {
  let text = markdown.replace(/\r\n?/g, '\n');
  text = removeCodeBlocks(text);

  const codeSpans: string[] = [];
  const codeSpanMarker = findUnusedMarker(text);
  text = text.replace(/(`+)([^`\n]*?)\1/g, (_match, _delimiter: string, content: string) => {
    const index = codeSpans.push(content) - 1;
    return `${codeSpanMarker}${index}${codeSpanMarker}`;
  });

  text = text.replace(/\$\$[\s\S]*?(?:\$\$|$)/g, '');
  text = text.replace(/\\\[[\s\S]*?(?:\\\]|$)/g, '');
  text = projectMarkdownTables(text);

  text = text.replace(/!\[[^\]]*\]\((?:[^()\\]|\\.)*\)/g, '');
  text = text.replace(/!\[[^\]]*\]\[[^\]]*\]/g, '');
  text = text.replace(/\[\d+\]\((?:[^()\\]|\\.)*\)/g, '');
  text = text.replace(/\[([^\]]+)\]\((?:[^()\\]|\\.)*\)/g, '$1');
  text = text.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');
  text = text.replace(/\[(?:cite:[^\]]+|\d+)\]/giu, '');
  text = text.replace(/【\d+†[^】]*】/gu, '');
  text = text.replace(/https?:\/\/[^\s<>]+/giu, preserveTrailingPunctuation);

  text = text.replace(/\\\(([^\n]*?)\\\)/g, (_match, expression: string) =>
    isSimpleMath(expression) ? expression : '',
  );
  text = text.replace(/\$(?!\s)([^$\n]*?\S)\$/g, (_match, expression: string) =>
    isSimpleMath(expression) ? expression : '',
  );

  const withoutBlockMarkers = text.split('\n').map(removeBlockMarkers).join('\n');
  const projected = projectMarkdownInlineForSpeech(withoutBlockMarkers).replace(
    new RegExp(`${codeSpanMarker}(\\d+)${codeSpanMarker}`, 'gu'),
    (_match, index: string) => codeSpans[Number(index)],
  );
  return normalizeSpeechWhitespace(projected);
}

function removeCodeBlocks(markdown: string): string {
  const output: string[] = [];
  let openFence: { character: string; length: number } | undefined;

  for (const line of markdown.split('\n')) {
    const blockLine = removeBlockMarkers(line);
    const fence = blockLine.match(/^\s*(`{3,}|~{3,})/u)?.[1];
    if (!openFence) {
      if (fence) {
        openFence = { character: fence[0], length: fence.length };
      } else if (/^(?: {4}|\t)/u.test(blockLine)) {
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

function findUnusedMarker(text: string): string {
  let marker = '\uE000';
  while (text.includes(marker)) {
    marker += '\uE000';
  }
  return marker;
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
