import type { MessagePresentationItem } from '../../types';

export type AssistantReadAloudContent = { language?: string; text: string };

const COMPLEX_LATEX_COMMAND = /\\[a-z]+/iu;
const SPEAKABLE_CHARACTER = /[\p{L}\p{N}]/u;

export function projectAssistantMessageReadAloud(
  message: MessagePresentationItem,
): AssistantReadAloudContent | null {
  if (message.role !== 'assistant' || message.status !== 'success') {
    return null;
  }

  let translation: AssistantReadAloudContent | undefined;
  for (const part of message.data.parts ?? []) {
    if (part.type === 'data-translation' && part.data.content.trim()) {
      translation = {
        language: part.data.targetLanguage,
        text: part.data.content,
      };
    }
  }

  const source =
    translation ??
    ({
      text: (message.data.parts ?? [])
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('\n\n'),
    } satisfies AssistantReadAloudContent);
  const text = cleanMarkdownForSpeech(source.text);

  if (!SPEAKABLE_CHARACTER.test(text)) {
    return null;
  }

  return source.language ? { language: source.language, text } : { text };
}

function cleanMarkdownForSpeech(markdown: string): string {
  let text = markdown.replace(/\r\n?/g, '\n');
  text = removeFencedCodeBlocks(text);
  text = text.replace(/\$\$[\s\S]*?(?:\$\$|$)/g, '');
  text = text.replace(/\\\[[\s\S]*?(?:\\\]|$)/g, '');
  text = projectMarkdownTables(text);

  text = text.replace(/!\[[^\]]*\]\((?:\\.|[^)])*\)/g, '');
  text = text.replace(/!\[[^\]]*\]\[[^\]]*\]/g, '');
  text = text.replace(/\[([^\]]+)\]\((?:\\.|[^)])*\)/g, '$1');
  text = text.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');
  text = text.replace(/\[(?:cite:[^\]]+|\d+)\]/giu, '');
  text = text.replace(/【\d+†[^】]*】/gu, '');
  text = text.replace(/https?:\/\/[^\s<>]+/giu, preserveTrailingPunctuation);

  text = text.replace(/\\\(([^\n]*?)\\\)/g, (_match, expression: string) =>
    isSimpleMath(expression) ? expression : '',
  );
  text = text.replace(/\$([^$\n]+)\$/g, (_match, expression: string) =>
    isSimpleMath(expression) ? expression : '',
  );
  text = text.replace(/(`+)([^`\n]*?)\1/g, '$2');
  text = text.replace(/(?:\*\*|__|~~|[*_])/g, '');

  return normalizeSpeechWhitespace(text.split('\n').map(removeBlockMarkers).join('\n'));
}

function removeFencedCodeBlocks(markdown: string): string {
  const output: string[] = [];
  let openFence: { character: string; length: number } | undefined;

  for (const line of markdown.split('\n')) {
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})/u)?.[1];
    if (!openFence) {
      if (fence) {
        openFence = { character: fence[0], length: fence.length };
      } else {
        output.push(line);
      }
      continue;
    }

    if (
      fence?.[0] === openFence.character &&
      fence.length >= openFence.length &&
      /^ {0,3}(?:`+|~+)\s*$/u.test(line)
    ) {
      openFence = undefined;
    }
  }

  return output.join('\n');
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
