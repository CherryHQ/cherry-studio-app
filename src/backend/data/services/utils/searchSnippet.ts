import {
  buildKeywordRegexes,
  type KeywordMatchMode,
} from '@cherrystudio/universal/utils/keywordSearch';

import type { AgentMessagePart } from '@/shared/contracts/agent';

const SEARCH_SNIPPET_MAX_LENGTH = 160;
const SEARCH_SNIPPET_CONTEXT_LENGTH = 24;

function stripProseFormatting(text: string): string {
  return text
    .replace(/!\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^ {0,3}#{1,6}(?:[ \t]+|$)/gm, '')
    .replace(/<[^>]*>/g, '');
}

/** Strip prose markup without interpreting literal fenced or inline code as markup. */
export function stripMarkdownFormatting(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n');
  const codePattern =
    /^ {0,3}(`{3,}|~{3,})[^\n]*\n([\s\S]*?)(?:^ {0,3}\1[ \t]*(?=\n|$)|(?![\s\S]))|(`+)([\s\S]*?)\3(?!`)/gm;
  const parts: string[] = [];
  let offset = 0;
  for (const match of normalized.matchAll(codePattern)) {
    parts.push(stripProseFormatting(normalized.slice(offset, match.index)));
    parts.push(match[2] ?? match[4]);
    offset = match.index + match[0].length;
  }
  parts.push(stripProseFormatting(normalized.slice(offset)));
  return parts.join('');
}

/**
 * The visible text of a message's `text` parts, as stored in `searchable_text` for FTS. Indexing
 * plain text keeps formatting from splitting a visible match. Reasoning and tool payloads are not
 * prose and stay out of search.
 */
export function toSearchableText(parts: readonly AgentMessagePart[]): string {
  const text = parts
    .flatMap((part) => (part.type === 'text' && part.text.trim() !== '' ? [part.text] : []))
    .join('\n');
  return text ? stripMarkdownFormatting(text) : '';
}

/** A compact preview of indexed plain text whose first line includes the earliest keyword match. */
export function buildSearchSnippet(
  plainText: string,
  terms: string[],
  matchMode: KeywordMatchMode,
): string {
  const text = plainText.replace(/\s+/g, ' ').trim();
  const matches = buildKeywordRegexes(terms, { flags: 'i', matchMode })
    .map((regex) => regex.exec(text))
    .filter((match) => match !== null);
  const firstMatch = matches.reduce<RegExpExecArray | undefined>(
    (first, match) => (!first || match.index < first.index ? match : first),
    undefined,
  );
  const start = Math.max(0, (firstMatch?.index ?? 0) - SEARCH_SNIPPET_CONTEXT_LENGTH);
  const end = Math.min(text.length, start + SEARCH_SNIPPET_MAX_LENGTH);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}
