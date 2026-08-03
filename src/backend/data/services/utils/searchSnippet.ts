import {
  buildKeywordRegexes,
  type KeywordMatchMode,
} from '@cherrystudio/universal/utils/keywordSearch';

const searchSnippetContextLines = 1;
const searchSnippetMaxLines = 12;
const searchSnippetMaxLineLength = 160;
const searchSnippetLineFragmentRadius = 40;
const searchSnippetMaxLineFragments = 3;

export function stripMarkdownFormatting(text: string): string {
  return text
    .replace(/```(?:[^\n]*\n)?([\s\S]*?)```/g, '$1')
    .replace(/!\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/#+\s/g, '')
    .replace(/<[^>]*>/g, '');
}

const normalizeText = (text: string) => text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  const sorted = ranges.slice().sort((left, right) => left[0] - right[0]);
  const merged: Array<[number, number]> = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (!last || range[0] > last[1] + 1) {
      merged.push(range);
      continue;
    }
    last[1] = Math.max(last[1], range[1]);
  }
  return merged;
}

function buildLineSnippet(line: string, regexes: RegExp[]): string {
  if (line.length <= searchSnippetMaxLineLength) return line;

  const matchRanges: Array<[number, number]> = [];
  for (const regex of regexes) {
    regex.lastIndex = 0;
    let match = regex.exec(line);
    while (match !== null) {
      matchRanges.push([match.index, match.index + match[0].length]);
      if (match[0].length === 0) regex.lastIndex += 1;
      match = regex.exec(line);
    }
  }

  if (matchRanges.length === 0) return `${line.slice(0, searchSnippetMaxLineLength)}...`;

  const expandedRanges: Array<[number, number]> = matchRanges.map(([start, end]) => [
    Math.max(0, start - searchSnippetLineFragmentRadius),
    Math.min(line.length, end + searchSnippetLineFragmentRadius),
  ]);
  const mergedRanges = mergeRanges(expandedRanges);
  const limitedRanges = mergedRanges.slice(0, searchSnippetMaxLineFragments);
  const lastLimitedRange = limitedRanges.at(-1);

  let result = limitedRanges.map(([start, end]) => line.slice(start, end)).join(' ... ');
  if (limitedRanges[0][0] > 0) result = `...${result}`;
  if (lastLimitedRange && lastLimitedRange[1] < line.length) result = `${result}...`;
  if (mergedRanges.length > searchSnippetMaxLineFragments) result = `${result}...`;
  if (result.length > searchSnippetMaxLineLength) {
    result = `${result.slice(0, searchSnippetMaxLineLength)}...`;
  }
  return result;
}

export function buildSearchSnippet(
  text: string,
  terms: string[],
  matchMode: KeywordMatchMode,
): string {
  const lines = normalizeText(stripMarkdownFormatting(text)).split('\n');
  if (lines.length === 0) return '';

  const regexes = buildKeywordRegexes(
    terms.filter((term) => term.length > 0),
    { flags: 'gi', matchMode },
  );
  const matchedLineIndexes: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      regexes.some((regex) => {
        regex.lastIndex = 0;
        return regex.test(line);
      })
    ) {
      matchedLineIndexes.push(index);
    }
  }

  const ranges: Array<[number, number]> =
    matchedLineIndexes.length > 0
      ? mergeRanges(
          matchedLineIndexes.map((index) => [
            Math.max(0, index - searchSnippetContextLines),
            Math.min(lines.length - 1, index + searchSnippetContextLines),
          ]),
        )
      : [[0, Math.min(lines.length - 1, searchSnippetMaxLines - 1)]];

  const outputLines: string[] = [];
  let truncated = false;
  if (ranges[0][0] > 0) outputLines.push('...');

  for (const [start, end] of ranges) {
    if (outputLines.length >= searchSnippetMaxLines) {
      truncated = true;
      break;
    }
    if (outputLines.length > 0 && outputLines.at(-1) !== '...') outputLines.push('...');
    for (let index = start; index <= end; index += 1) {
      if (outputLines.length >= searchSnippetMaxLines) {
        truncated = true;
        break;
      }
      outputLines.push(buildLineSnippet(lines[index], regexes));
    }
    if (truncated) break;
  }

  const lastRange = ranges.at(-1);
  if (
    (truncated || (lastRange !== undefined && lastRange[1] < lines.length - 1)) &&
    outputLines.at(-1) !== '...'
  ) {
    outputLines.push('...');
  }
  return outputLines.join('\n');
}
