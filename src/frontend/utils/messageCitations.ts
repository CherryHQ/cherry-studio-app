import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryToolMetadata } from '@/shared/data/types/uiParts';

const CITABLE_TOOL_NAMES = new Set(['web_search', 'web_fetch', 'kb_search', 'kb_read']);
const MARKDOWN_CODE_PATTERN = /```[\s\S]*?```|`[^`\n]*`/gm;
const CIRCLED_CITATION_MARKERS = [
  '❶',
  '❷',
  '❸',
  '❹',
  '❺',
  '❻',
  '❼',
  '❽',
  '❾',
  '❿',
  '⓫',
  '⓬',
  '⓭',
  '⓮',
  '⓯',
  '⓰',
  '⓱',
  '⓲',
  '⓳',
  '⓴',
] as const;

export type CitationSource = {
  content?: string;
  id: string;
  title: string;
  url?: string;
};

export type ResolvedCitationText = {
  markdown: string;
  plainText: string;
};

export type ResolvedMessageCitations = {
  sourceNumberById: ReadonlyMap<string, number>;
  textByPartIndex: ReadonlyMap<number, ResolvedCitationText>;
};

/** Resolve persisted citation markers from their message-local tool results. */
export function resolveMessageCitations(
  parts: readonly CherryMessagePart[],
  additionalSources: readonly CitationSource[] = [],
): ResolvedMessageCitations {
  const sourceById = collectCitationSources(parts, additionalSources);
  if (sourceById.size === 0) {
    return { sourceNumberById: new Map(), textByPartIndex: new Map() };
  }

  const numberBySource = new Map<CitationSource, number>();
  const textByPartIndex = new Map<number, ResolvedCitationText>();
  let nextNumber = 1;

  parts.forEach((part, index) => {
    if (part.type !== 'text' || !part.text.includes('[cite:')) return;

    const replace = (content: string, markdown: boolean) =>
      mapMarkdownOutsideCode(content, (text) =>
        text.replace(/\[cite:([\w-]+)\]/g, (rawMarker, id: string) => {
          const source = sourceById.get(id);
          if (!source) return rawMarker;

          let number = numberBySource.get(source);
          if (!number) {
            number = nextNumber++;
            numberBySource.set(source, number);
          }

          const marker = CIRCLED_CITATION_MARKERS[number - 1] ?? String(number);
          if (markdown && source.url) {
            // encodeURIComponent leaves parentheses unescaped; Markdown treats them as delimiters.
            const target = encodeURIComponent(source.url).replace(/[()]/g, (character) =>
              character === '(' ? '%28' : '%29',
            );
            return `[${marker}](cite:${target})`;
          }
          return markdown ? marker : `[${number}]`;
        }),
      );

    textByPartIndex.set(index, {
      markdown: replace(part.text, true),
      plainText: replace(part.text, false),
    });
  });

  const sourceNumberById = new Map<string, number>();
  sourceById.forEach((source, id) => {
    const number = numberBySource.get(source);
    if (number !== undefined) sourceNumberById.set(id, number);
  });

  return { sourceNumberById, textByPartIndex };
}

function collectCitationSources(
  parts: readonly CherryMessagePart[],
  additionalSources: readonly CitationSource[],
): Map<string, CitationSource> {
  const sourceById = new Map<string, CitationSource>();
  const sourceByUrl = new Map<string, CitationSource>();
  for (const source of additionalSources) {
    const existing = source.url ? sourceByUrl.get(source.url) : undefined;
    sourceById.set(source.id, existing ?? source);
    if (source.url && !existing) sourceByUrl.set(source.url, source);
  }

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

    if (!('state' in part) || part.state !== 'output-available' || !('output' in part)) continue;
    const toolName =
      part.type === 'dynamic-tool'
        ? citableToolName(
            part.toolName,
            part.input,
            readCherryToolMetadata(part)?.tool?.type === 'builtin' ||
              isCherryCitationOutput(part.output),
          )
        : part.type.startsWith('tool-')
          ? citableToolName(part.type.slice(5), 'input' in part ? part.input : undefined, true)
          : undefined;
    if (!toolName || !CITABLE_TOOL_NAMES.has(toolName)) continue;

    for (const item of toolCitationSources(toolName, part.output)) {
      const existing = item.url ? sourceByUrl.get(item.url) : undefined;
      const source = existing ?? item;
      sourceById.set(item.id, source);
      if (item.url && !existing) sourceByUrl.set(item.url, source);
    }
  }

  return sourceById;
}

export function citableToolName(
  name: string,
  input?: unknown,
  builtin = false,
): string | undefined {
  if (name === 'tool_call' || name === 'tool_invoke') {
    return isRecord(input) && typeof input.name === 'string'
      ? citableToolName(input.name, undefined, builtin)
      : undefined;
  }
  if (builtin && CITABLE_TOOL_NAMES.has(name)) return name;
  const match =
    /^mcp__(?:cherry-tools|cherry_tools)__(web_search|web_fetch|kb_search|kb_read)$/.exec(name);
  return match?.[1];
}

export function unwrapCitationOutput(output: unknown): unknown {
  if (isRecord(output) && 'value' in output && Array.isArray(output.artifacts))
    output = output.value;
  if (!isRecord(output)) return output;
  if (isRecord(output.$persistedToolOutput) && output.$persistedToolOutput.shape === 'entities')
    return output.$persistedToolOutput.skeleton;
  if (isRecord(output.$deferredToolResult) && 'skeleton' in output) return output.skeleton;
  if (isRecord(output.metadata) && 'content' in output) return output.content;
  return output;
}

export function isCherryCitationOutput(output: unknown): boolean {
  if (!isRecord(output) || !isRecord(output.metadata)) return false;
  return (
    output.metadata.type === 'builtin' ||
    output.metadata.serverId === 'cherry-tools' ||
    output.metadata.serverName === 'cherry-tools'
  );
}

export function canReadToolCitations(name: string): boolean {
  return (
    CITABLE_TOOL_NAMES.has(name) ||
    Boolean(citableToolName(name)) ||
    name === 'tool_call' ||
    name === 'tool_invoke'
  );
}

export function toolCitationSources(toolName: string, value: unknown): CitationSource[] {
  const output = unwrapCitationOutput(value);
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
  let url: string | undefined;
  if (typeof value.url === 'string') {
    try {
      const parsed = new URL(value.url);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
        return null;
      url = value.url;
    } catch {
      return null;
    }
  }
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
