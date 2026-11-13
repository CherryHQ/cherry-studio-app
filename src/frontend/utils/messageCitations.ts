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

/** Resolve only confirmed sources; native numbering is local to this message. */
export function resolveMessageCitations(
  parts: readonly CherryMessagePart[],
  additionalSources: readonly CitationSource[] = [],
): ResolvedMessageCitations {
  const sourceById = collectCitationSources(parts, additionalSources);
  if (sourceById.size === 0) {
    return { sourceNumberById: new Map(), textByPartIndex: new Map() };
  }

  const numberBySource = new Map<CitationSource, number>();
  const toolIds = new Set(collectToolCitationSources(parts).map((source) => source.id));
  const native = parts.filter(
    (part): part is Extract<CherryMessagePart, { type: 'source-url' }> =>
      part.type === 'source-url' && !toolIds.has(part.sourceId),
  );
  const nativeByNumber = new Map(
    native.map((part, index) => [
      Number(/^(?:source-)?([1-9]\d*)$/.exec(part.sourceId)?.[1] ?? index + 1),
      part.sourceId,
    ]),
  );
  const textByPartIndex = new Map<number, ResolvedCitationText>();
  let nextNumber = 1;

  parts.forEach((part, index) => {
    if (part.type !== 'text') return;

    const replace = (content: string, markdown: boolean) =>
      mapMarkdownOutsideCode(content, (text) =>
        text
          .replace(/\[(\d{1,3})\](?![(:[])/g, (marker, number: string) => {
            const id = nativeByNumber.get(Number(number));
            return id ? `[cite:${id}]` : marker;
          })
          .replace(/cite([^]+)/g, (marker, value: string) => {
            const ids = value.split('');
            return ids.every((id) => sourceById.has(id))
              ? ids.map((id) => `[cite:${id}]`).join('')
              : marker;
          })
          .replace(/\[cite:([^\]\n]+)\]/g, (marker, value: string) => {
            const ids = value.split(/[\s,;]+/).map((id) => id.replace(/^cite:/, ''));
            return ids.every((id) => /^[\w-]+$/.test(id))
              ? ids.map((id) => `[cite:${id}]`).join('')
              : marker;
          })
          .replace(/\[cite:([\w-]+)\]/g, (rawMarker, id: string) => {
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

    for (const item of collectToolCitationSources([part])) {
      const existing = item.url ? sourceByUrl.get(item.url) : undefined;
      const source = existing ?? item;
      sourceById.set(item.id, source);
      if (item.url && !existing) sourceByUrl.set(item.url, source);
    }
  }

  return sourceById;
}

export function collectToolCitationSources(parts: readonly CherryMessagePart[]): CitationSource[] {
  return parts.flatMap((part) => {
    if (!('state' in part) || part.state !== 'output-available' || !('output' in part)) return [];
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
    return toolName ? toolCitationSources(toolName, part.output) : [];
  });
}

export function citationIds(parts: readonly CherryMessagePart[]): string[] {
  const ids = new Set<string>();
  for (const part of parts) {
    if (part.type !== 'text') continue;
    mapMarkdownOutsideCode(part.text, (text) => {
      for (const match of text.matchAll(/\[cite:([^\]\n]+)\]/g))
        for (const id of match[1].split(/[\s,;]+/).map((item) => item.replace(/^cite:/, '')))
          if (/^[\w-]+$/.test(id)) ids.add(id);
      for (const match of text.matchAll(/cite([^]+)/g))
        for (const id of match[1].split('')) if (/^[\w-]+$/.test(id)) ids.add(id);
      return text;
    });
  }
  return [...ids];
}

/** Only earlier tool facts are eligible; native provider numbering never crosses a message. */
export function conversationCitationSources(
  messages: readonly {
    id: string;
    parts: readonly CherryMessagePart[];
    sources: readonly CitationSource[];
  }[],
) {
  const prior = new Map<string, CitationSource>();
  const result = new Map<string, CitationSource[]>();
  for (const message of messages) {
    const own = [...collectToolCitationSources(message.parts), ...message.sources];
    const sources = new Map(own.map((source) => [source.id, source]));
    for (const id of citationIds(message.parts))
      if (!sources.has(id) && prior.has(id)) sources.set(id, prior.get(id)!);
    result.set(message.id, [...sources.values()]);
    for (const source of own) prior.set(source.id, source);
  }
  return result;
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
