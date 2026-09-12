import {
  buildKeywordRegexes,
  type KeywordMatchMode,
} from '@cherrystudio/universal/utils/keywordSearch';

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

/** A compact preview whose first visible line includes the earliest keyword match. */
export function buildSearchSnippet(
  text: string,
  terms: string[],
  matchMode: KeywordMatchMode,
): string {
  const plainText = stripMarkdownFormatting(text).replace(/\s+/g, ' ').trim();
  const matches = buildKeywordRegexes(terms, { flags: 'i', matchMode })
    .map((regex) => regex.exec(plainText))
    .filter((match) => match !== null);
  const firstMatch = matches.reduce<RegExpExecArray | undefined>(
    (first, match) => (!first || match.index < first.index ? match : first),
    undefined,
  );
  const start = Math.max(0, (firstMatch?.index ?? 0) - SEARCH_SNIPPET_CONTEXT_LENGTH);
  const end = Math.min(plainText.length, start + SEARCH_SNIPPET_MAX_LENGTH);
  return (start > 0 ? '…' : '') + plainText.slice(start, end) + (end < plainText.length ? '…' : '');
}
