import { AgentToolResultSchema } from '@/shared/contracts/agent';
import type { CherryMessagePart } from '@/shared/data/types/message';

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

export type MessageCitationSource = Readonly<{
  content?: string;
  id: string;
  title: string;
  url?: string;
}>;

export type ResolvedCitationSource = MessageCitationSource & { number?: number };

export type ResolvedCitationText = {
  markdown: string;
  plainText: string;
};

export type ResolvedMessageCitations = {
  sourceNumberById: ReadonlyMap<string, number>;
  sourceById: ReadonlyMap<string, MessageCitationSource>;
  sources: readonly ResolvedCitationSource[];
  textByPartIndex: ReadonlyMap<number, ResolvedCitationText>;
};

/** Validate links without changing the exact URL string used for alias identity. */
export function normalizeCitationUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) {
      return value;
    }
  } catch {
    // Invalid sources must never become links.
  }
  return undefined;
}

/** Collect only explicit provider sources and recognized, completed lookup results. */
export function collectMessageCitationSources(
  parts: readonly CherryMessagePart[],
): readonly MessageCitationSource[] {
  const sources: MessageCitationSource[] = [];
  for (const part of parts) {
    if (part.type === 'source-url') {
      const url = normalizeCitationUrl(part.url);
      if (url && typeof part.sourceId === 'string' && part.sourceId.length > 0) {
        sources.push({ id: part.sourceId, title: part.title ?? new URL(url).href, url });
      }
      continue;
    }
    if (!('state' in part) || part.state !== 'output-available' || !('output' in part)) {
      continue;
    }
    let name: unknown;
    if (part.type === 'dynamic-tool') {
      // Prefer the explicit name; only builtin references can supply a fallback.
      const dynamic: Record<string, unknown> = part;
      name =
        typeof dynamic.toolName === 'string'
          ? dynamic.toolName
          : isRecord(dynamic.toolRef) && dynamic.toolRef.source === 'builtin'
            ? dynamic.toolRef.capabilityId
            : undefined;
    } else if (part.type.startsWith('tool-')) {
      name = part.type.slice(5);
      if (name === 'tool_invoke') {
        name = 'input' in part && isRecord(part.input) ? part.input.name : undefined;
      }
    }
    if (typeof name === 'string' && CITABLE_TOOL_NAMES.has(name)) {
      sources.push(...normalizeCitationOutput(name, part.output));
    }
  }
  return sources;
}

/** Resolve IDs first, then number shared sources by their first non-code reference. */
export function resolveMessageCitations(
  parts: readonly CherryMessagePart[],
  sources?: readonly MessageCitationSource[],
): ResolvedMessageCitations {
  const sourceById = new Map<string, MessageCitationSource>();
  const sourceByUrl = new Map<string, MessageCitationSource>();
  const orderedSources: MessageCitationSource[] = [];
  for (const value of sources ?? collectMessageCitationSources(parts)) {
    const item = toCitationSource(value);
    if (!item) continue;
    const existing = item.url ? sourceByUrl.get(item.url) : undefined;
    const source = existing ?? item;
    sourceById.set(item.id, source);
    if (!existing) {
      orderedSources.push(source);
      if (item.url) sourceByUrl.set(item.url, source);
    }
  }

  if (sources !== undefined) {
    for (const item of collectMessageCitationSources(parts)) {
      const canonical = item.url ? sourceByUrl.get(item.url) : undefined;
      if (canonical && !sourceById.has(item.id)) sourceById.set(item.id, canonical);
    }
  }

  const numberBySource = new Map<MessageCitationSource, number>();
  for (const part of parts) {
    if (part.type !== 'text' || !part.text.includes('[cite:')) continue;
    walkCitationMarkers(part.text, (marker, id) => {
      const source = sourceById.get(id);
      if (source && !numberBySource.has(source)) {
        numberBySource.set(source, numberBySource.size + 1);
      }
      return marker;
    });
  }
  const sourceNumberById = new Map<string, number>();
  sourceById.forEach((source, id) => {
    const number = numberBySource.get(source);
    if (number !== undefined) sourceNumberById.set(id, number);
  });
  const textByPartIndex = new Map<number, ResolvedCitationText>();
  parts.forEach((part, index) => {
    if (part.type !== 'text' || !part.text.includes('[cite:')) return;
    const options = { numbers: sourceNumberById, sources: sourceById };
    textByPartIndex.set(index, {
      markdown: replaceCitationMarkers(part.text, { ...options, format: 'markdown' }),
      plainText: replaceCitationMarkers(part.text, { ...options, format: 'plain' }),
    });
  });
  const liveSources = new Set(sourceById.values());
  return {
    sourceNumberById,
    sourceById,
    sources: orderedSources
      .filter((source) => liveSources.has(source))
      .map((source) => {
        const number = numberBySource.get(source);
        return number === undefined ? source : { ...source, number };
      }),
    textByPartIndex,
  };
}

/** Replace citation markers while preserving code and backslash escapes verbatim. */
export function replaceCitationMarkers(
  text: string,
  options: {
    format: 'markdown' | 'plain' | 'export';
    numbers: ReadonlyMap<string, number>;
    sources: ReadonlyMap<string, MessageCitationSource>;
  },
): string {
  return walkCitationMarkers(text, (rawMarker, id) => {
    const source = options.sources.get(id);
    const number = options.numbers.get(id);
    if (!source || number === undefined) return rawMarker;
    if (options.format === 'plain') return `[${number}]`;
    if (options.format === 'export')
      return source.url ? `[${number}](<${source.url}>)` : `[${number}]`;
    const marker = CIRCLED_CITATION_MARKERS[number - 1] ?? String(number);
    if (!source.url) return marker;
    const target = encodeURIComponent(source.url).replace(/[()]/g, (character) =>
      character === '(' ? '%28' : '%29',
    );
    return `[${marker}](cite:${target})`;
  });
}

function normalizeCitationOutput(toolName: string, output: unknown): MessageCitationSource[] {
  const parsed = AgentToolResultSchema.safeParse(output);
  if (parsed.success) {
    output = parsed.data.value;
    if (isRecord(output) && isRecord(output.details) && 'results' in output.details) {
      output = output.details.results;
    }
  } else if (isRecord(output) && 'value' in output) {
    return [];
  }
  const list =
    toolName === 'kb_read'
      ? Array.isArray(output)
        ? output.length === 1
          ? output
          : []
        : [output]
      : Array.isArray(output)
        ? output
        : isRecord(output) && Array.isArray(output.results)
          ? output.results
          : [];
  return list.flatMap((value) => {
    const source = toCitationSource(value);
    return source ? [source] : [];
  });
}

function toCitationSource(value: unknown): MessageCitationSource | undefined {
  if (!isRecord(value)) return undefined;
  const id =
    typeof value.id === 'string' && value.id.length > 0
      ? value.id
      : typeof value.id === 'number' && Number.isFinite(value.id)
        ? String(value.id)
        : undefined;
  if (id === undefined) return undefined;
  const url = normalizeCitationUrl(value.url);
  if ('url' in value && !url) return undefined;
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
  return { id, title, ...(content !== undefined ? { content } : {}), ...(url ? { url } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Same fence, indentation, escape and multiline-inline boundaries as chat export. */
function walkCitationMarkers(
  source: string,
  replace: (marker: string, id: string) => string,
): string {
  let fence: { character: string; count: number; quoteDepth: number; indent: number } | undefined;
  let offset = 0;
  let inlineEnd = -1;
  return source
    .split(/(?<=\n)/)
    .map((line) => {
      const start = offset;
      offset += line.length;
      if (inlineEnd <= start) {
        const quote = /^( {0,3}>[ \t]?)+/.exec(line)?.[0] ?? '';
        const quoteDepth = (quote.match(/>/g) ?? []).length;
        const unquoted = line.slice(quote.length);
        const list = /^ {0,3}(?:[-+*]|\d+[.)])[ \t]+/.exec(unquoted)?.[0];
        if (
          fence &&
          (quoteDepth < fence.quoteDepth ||
            (fence.indent > 0 && unquoted.trim() && !unquoted.startsWith(' '.repeat(fence.indent))))
        )
          fence = undefined;
        const content = list
          ? unquoted.slice(list.length)
          : fence?.indent
            ? unquoted.slice(fence.indent)
            : unquoted;
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
          fence = {
            character: delimiter[1][0],
            count: delimiter[1].length,
            quoteDepth,
            indent: list?.length ?? 0,
          };
          return line;
        }
        if (/^( {4}|\t)/.test(content)) return line;
      }
      let position = Math.max(0, Math.min(line.length, inlineEnd - start));
      let result = line.slice(0, position);
      while (position < line.length) {
        if (line.charCodeAt(position) === 92) {
          result += line.slice(position, position + 2);
          position += 2;
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
          if (closing && !/\r?\n[ \t]*\r?\n/.test(source.slice(start + position, closing.index))) {
            inlineEnd = closing.index + run.length;
            const end = Math.min(line.length, inlineEnd - start);
            result += line.slice(position, end);
            position = end;
            continue;
          }
          result += run;
          position += run.length;
          continue;
        }
        const marker = /^\[cite:([\w-]+)\]/.exec(line.slice(position));
        if (marker) {
          result += replace(marker[0], marker[1]);
          position += marker[0].length;
        } else result += line[position++];
      }
      return result;
    })
    .join('');
}
