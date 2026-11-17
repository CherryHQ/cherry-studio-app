import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryToolMetadata } from '@/shared/data/types/uiParts';

const CITABLE_TOOL_NAMES = new Set(['web_search', 'web_fetch', 'kb_search', 'kb_read']);
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
  format: 'display' | 'export' = 'display',
  preferredNumbers?: ReadonlyMap<string, number>,
): ResolvedMessageCitations {
  const sourceById = collectCitationSources(parts, additionalSources);
  if (sourceById.size === 0) {
    return { sourceNumberById: new Map(), textByPartIndex: new Map() };
  }

  const numberBySource = new Map<CitationSource, number>();
  preferredNumbers?.forEach((number, id) => {
    const source = sourceById.get(id);
    if (source && !numberBySource.has(source)) numberBySource.set(source, number);
  });
  const toolIds = new Set(collectToolCitationSources(parts).map((source) => source.id));
  const native = parts.filter(
    (part): part is Extract<CherryMessagePart, { type: 'source-url' }> =>
      part.type === 'source-url' && !toolIds.has(part.sourceId),
  );
  const nativeByNumber = new Map<number, string>();
  const unnumbered: { index: number; sourceId: string }[] = [];
  native.forEach((part, index) => {
    const number = nativeSourceNumber(part.sourceId);
    if (number !== undefined) {
      if (!nativeByNumber.has(number)) nativeByNumber.set(number, part.sourceId);
    } else {
      unnumbered.push({ index, sourceId: part.sourceId });
    }
  });
  for (const item of unnumbered) {
    if (!nativeByNumber.has(item.index + 1)) nativeByNumber.set(item.index + 1, item.sourceId);
  }
  const textByPartIndex = new Map<number, ResolvedCitationText>();
  let nextNumber = Math.max(0, ...numberBySource.values()) + 1;

  parts.forEach((part, index) => {
    if (part.type !== 'text') return;

    const replace = (content: string, markdown: boolean) =>
      mapMarkdownOutsideCode(content, (text) =>
        text
          .replace(
            /\[(\d{1,3})\](?![(:]|\[(?!\d{1,3}\](?![(:])|cite:))/g,
            (marker, number: string) => {
              const id = nativeByNumber.get(Number(number));
              return id ? `[cite:${id}]` : marker;
            },
          )
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
              if (format === 'export') return `[${number}](<${new URL(source.url).href}>)`;
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

export function collectCitationSources(
  parts: readonly CherryMessagePart[],
  additionalSources: readonly CitationSource[] = [],
): Map<string, CitationSource> {
  const sourceById = new Map<string, CitationSource>();
  const sourceByUrl = new Map<string, CitationSource>();
  for (const candidate of additionalSources) {
    const source = toCitationSource(candidate);
    if (!source) continue;
    const existing = source.url ? sourceByUrl.get(source.url) : undefined;
    sourceById.set(source.id, existing ?? source);
    if (source.url && !existing) sourceByUrl.set(source.url, source);
  }

  for (const part of parts) {
    if (part.type === 'source-url') {
      const source = toCitationSource({
        id: part.sourceId,
        title: part.title ?? part.url,
        url: part.url,
      });
      if (!source) continue;
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

function mapMarkdownOutsideCode(source: string, transform: (text: string) => string): string {
  let fence: { character: string; count: number } | undefined;
  let offset = 0;
  let inlineEnd = -1;
  return source
    .split(/(?<=\n)/)
    .map((line) => {
      const start = offset;
      offset += line.length;
      if (inlineEnd <= start) {
        const content = line
          .replace(/^( {0,3}>[ \t]?)+/, '')
          .replace(/^ {0,3}(?:[-+*]|\d+[.)])[ \t]+/, '');
        const delimiter = /^ {0,3}(`{3,}|~{3,})/.exec(content);
        if (fence) {
          if (
            delimiter &&
            delimiter[1][0] === fence.character &&
            delimiter[1].length >= fence.count &&
            content.slice(delimiter[0].length).trim() === ''
          )
            fence = undefined;
          return line;
        }
        if (delimiter) {
          fence = { character: delimiter[1][0], count: delimiter[1].length };
          return line;
        }
        if (/^( {4}|\t)/.test(content)) return line;
      }
      let position = Math.max(0, Math.min(line.length, inlineEnd - start));
      let result = line.slice(0, position);
      let plainStart = position;
      while (position < line.length) {
        if (line.charCodeAt(position) === 92) {
          result +=
            transform(line.slice(plainStart, position)) + line.slice(position, position + 2);
          position += 2;
          plainStart = position;
          continue;
        }
        if (line[position] === '`') {
          const run = /^`+/.exec(line.slice(position))![0];
          const delimiters = /`+/g;
          delimiters.lastIndex = start + position + run.length;
          let closing: RegExpExecArray | null;
          while ((closing = delimiters.exec(source)) && closing[0].length !== run.length) {
            /* Only an equally long delimiter closes inline code. */
          }
          if (closing) {
            inlineEnd = closing.index + run.length;
            const end = Math.min(line.length, inlineEnd - start);
            result += transform(line.slice(plainStart, position)) + line.slice(position, end);
            position = end;
            plainStart = position;
            continue;
          }
          position += run.length;
          continue;
        }
        position++;
      }
      return result + transform(line.slice(plainStart));
    })
    .join('');
}

function nativeSourceNumber(sourceId: string): number | undefined {
  const citation = /^citation-(\d+)$/.exec(sourceId);
  if (citation) return Number(citation[1]) + 1;
  const source = /^(?:source-)?([1-9]\d*)$/.exec(sourceId);
  return source ? Number(source[1]) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
