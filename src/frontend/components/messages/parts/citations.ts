import type { CherryMessagePart } from '@/shared/data/types/message';

const CITABLE_TOOL_NAMES = new Set(['web_search', 'web_fetch', 'kb_search', 'kb_read']);
const MARKDOWN_CODE_PATTERN = /```[\s\S]*?```|`[^`\n]*`/gm;

type CitationSource = {
  content?: string;
  id: string;
  title: string;
  url?: string;
};

export type ResolvedCitationText = {
  markdown: string;
  plainText: string;
};

/** Resolve persisted citation markers from their message-local tool results. */
export function resolveMessageCitationText(
  parts: readonly CherryMessagePart[],
): Map<number, ResolvedCitationText> {
  const sourceById = collectCitationSources(parts);
  if (sourceById.size === 0) return new Map();

  const numberBySource = new Map<CitationSource, number>();
  const result = new Map<number, ResolvedCitationText>();
  let nextNumber = 1;

  parts.forEach((part, index) => {
    if (part.type !== 'text' || !part.text.includes('[cite:')) return;

    const replace = (content: string, markdown: boolean) =>
      mapMarkdownOutsideCode(content, (text) =>
        text.replace(/\[cite:([\w-]+)\]/g, (marker, id: string) => {
          const source = sourceById.get(id);
          if (!source) return marker;

          let number = numberBySource.get(source);
          if (!number) {
            number = nextNumber++;
            numberBySource.set(source, number);
          }

          return markdown && source.url ? `[${number}](${source.url})` : `[${number}]`;
        }),
      );

    result.set(index, {
      markdown: replace(part.text, true),
      plainText: replace(part.text, false),
    });
  });

  return result;
}

function collectCitationSources(parts: readonly CherryMessagePart[]): Map<string, CitationSource> {
  const sourceById = new Map<string, CitationSource>();
  const sourceByUrl = new Map<string, CitationSource>();

  for (const part of parts) {
    if (part.type === 'source-url') {
      const source = {
        id: part.sourceId,
        title: part.title ?? part.url,
        url: part.url,
      };
      const existing = sourceByUrl.get(part.url);
      sourceById.set(part.sourceId, existing ?? source);
      if (!existing) sourceByUrl.set(part.url, source);
      continue;
    }

    if (!isCompletedStaticToolPart(part)) continue;
    const toolName = resolveToolName(part);
    if (!toolName || !CITABLE_TOOL_NAMES.has(toolName)) continue;

    for (const item of normalizeCitationOutput(toolName, part.output)) {
      const existing = item.url ? sourceByUrl.get(item.url) : undefined;
      const source = existing ?? item;
      sourceById.set(item.id, source);
      if (item.url && !existing) sourceByUrl.set(item.url, source);
    }
  }

  return sourceById;
}

function isCompletedStaticToolPart(part: CherryMessagePart): part is Extract<
  CherryMessagePart,
  { type: `tool-${string}` }
> & {
  output: unknown;
  state: 'output-available';
} {
  return part.type.startsWith('tool-') && 'state' in part && part.state === 'output-available';
}

function resolveToolName(
  part: Extract<CherryMessagePart, { type: `tool-${string}` }> & { input?: unknown },
): string | undefined {
  const name = part.type.slice('tool-'.length);
  if (name !== 'tool_invoke') return name;
  return isRecord(part.input) && typeof part.input.name === 'string' ? part.input.name : undefined;
}

function normalizeCitationOutput(toolName: string, output: unknown): CitationSource[] {
  if (toolName === 'kb_read') {
    const item = toCitationSource(output);
    return item ? [item] : [];
  }

  const list = Array.isArray(output)
    ? output
    : isRecord(output) && Array.isArray(output.results)
      ? output.results
      : [];
  return list.flatMap((item) => {
    const source = toCitationSource(item);
    return source ? [source] : [];
  });
}

function toCitationSource(value: unknown): CitationSource | null {
  if (!isRecord(value) || (typeof value.id !== 'string' && typeof value.id !== 'number')) {
    return null;
  }
  const url = typeof value.url === 'string' && value.url.startsWith('http') ? value.url : undefined;
  const title =
    typeof value.title === 'string'
      ? value.title
      : typeof value.conceptId === 'string'
        ? value.conceptId
        : (url ?? '');
  const content =
    typeof value.content === 'string'
      ? value.content
      : typeof value.pageContent === 'string'
        ? value.pageContent
        : undefined;
  return { content, id: String(value.id), title, url };
}

function mapMarkdownOutsideCode(content: string, transform: (text: string) => string): string {
  MARKDOWN_CODE_PATTERN.lastIndex = 0;
  let cursor = 0;
  let result = '';
  let match: RegExpExecArray | null;

  while ((match = MARKDOWN_CODE_PATTERN.exec(content)) !== null) {
    result += transform(content.slice(cursor, match.index));
    result += match[0];
    cursor = match.index + match[0].length;
  }

  return result + transform(content.slice(cursor));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
