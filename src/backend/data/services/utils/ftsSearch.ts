import {
  buildKeywordRegexes,
  type KeywordMatchMode,
  splitKeywordsToTerms,
} from '@cherrystudio/universal/utils/keywordSearch';
import { loggerService } from '@logger';
import { type SQL, sql } from 'drizzle-orm';

import { DataApiErrorFactory } from '@/shared/data/api/errors';
import type { CursorPaginationResponse } from '@/shared/data/api/types';

import { asNumericKey, encodeCursor, parseCursor } from './keysetCursor';
import { stripMarkdownFormatting } from './searchSnippet';

const defaultFtsSearchLimit = 500;
const ftsSearchChunkSize = 200;
const ftsSearchMaxCandidates = 5_000;
const logger = loggerService.withContext('FtsSearch');

export type SearchCursor = { createdAt: number; id: string };
export type SearchFetchContext = {
  chunkSize: number;
  createdAtFromMs: number | undefined;
  cursor: SearchCursor | undefined;
  ftsConditions: SQL[];
  offset: number;
};

type SearchMapContext = {
  matchMode: KeywordMatchMode;
  snippet: string;
  terms: string[];
};
type CursorConfig = { errorMessage: string; fieldMessage: string };
type SearchMappedItem<PublicItem> = { item: PublicItem; sort: SearchCursor };
type SearchWithCursorOptions<Row, PublicItem> = {
  buildSnippet: (text: string, terms: string[], matchMode: KeywordMatchMode) => string;
  createdAtFrom?: string;
  cursor?: string;
  cursorConfig: CursorConfig;
  fetchRows: (context: SearchFetchContext) => Promise<Row[]>;
  getSearchableText: (row: Row) => string;
  limit?: number;
  mapRow: (row: Row, context: SearchMapContext) => SearchMappedItem<PublicItem>;
  maxCandidates?: number;
  q: string;
};

export function decodeSearchCursor(raw: string, config: CursorConfig): SearchCursor {
  const parsed = parseCursor(raw, asNumericKey);
  if (!parsed) {
    throw DataApiErrorFactory.validation({ cursor: [config.fieldMessage] }, config.errorMessage);
  }
  return { createdAt: parsed.key, id: parsed.id };
}

export function encodeSearchCursor(createdAt: number, id: string): string {
  return encodeCursor(createdAt, id);
}

export function buildFtsLikePattern(term: string): string {
  return `%${term}%`;
}

export function getCreatedAtFromMs(createdAtFrom: string | undefined): number | undefined {
  if (!createdAtFrom) return undefined;
  const value = Date.parse(createdAtFrom);
  return Number.isFinite(value) ? value : undefined;
}

export async function searchWithCursor<Row, PublicItem>({
  buildSnippet,
  createdAtFrom,
  cursor: rawCursor,
  cursorConfig,
  fetchRows,
  getSearchableText,
  limit = defaultFtsSearchLimit,
  mapRow,
  maxCandidates = ftsSearchMaxCandidates,
  q,
}: SearchWithCursorOptions<Row, PublicItem>): Promise<CursorPaginationResponse<PublicItem>> {
  const terms = splitKeywordsToTerms(q);
  if (terms.length === 0) return { items: [] };

  const matchMode: KeywordMatchMode = 'substring';
  const fetchLimit = limit + 1;
  const regexes = buildKeywordRegexes(terms, { flags: 'i', matchMode });
  const ftsConditions = terms.map(
    (term) => sql`fts.searchable_text LIKE ${buildFtsLikePattern(term)}`,
  );
  const cursor = rawCursor !== undefined ? decodeSearchCursor(rawCursor, cursorConfig) : undefined;
  const createdAtFromMs = getCreatedAtFromMs(createdAtFrom);
  const results: Array<SearchMappedItem<PublicItem>> = [];
  let offset = 0;
  let scannedCandidates = 0;

  while (results.length < fetchLimit) {
    const rows = await fetchRows({
      chunkSize: ftsSearchChunkSize,
      createdAtFromMs,
      cursor,
      ftsConditions,
      offset,
    });
    if (rows.length === 0) break;
    scannedCandidates += rows.length;
    offset += rows.length;

    for (const row of rows) {
      const searchableText = getSearchableText(row);
      if (!searchableText) continue;
      const plainText = stripMarkdownFormatting(searchableText);
      const matches = regexes.every((regex) => {
        regex.lastIndex = 0;
        return regex.test(plainText);
      });
      if (!matches) continue;

      results.push(
        mapRow(row, {
          matchMode,
          snippet: buildSnippet(searchableText, terms, matchMode),
          terms,
        }),
      );
      if (results.length >= fetchLimit) break;
    }

    if (scannedCandidates >= maxCandidates && results.length < fetchLimit) {
      logger.warn('FTS search candidate scan limit reached', {
        limit,
        maxCandidates,
        scannedCandidates,
        termCount: terms.length,
      });
      break;
    }
  }

  const itemsWithCursor = results.slice(0, limit);
  const nextCursorBoundary = results.length > limit ? itemsWithCursor.at(-1) : undefined;
  return {
    items: itemsWithCursor.map((result) => result.item),
    nextCursor: nextCursorBoundary
      ? encodeSearchCursor(nextCursorBoundary.sort.createdAt, nextCursorBoundary.sort.id)
      : undefined,
  };
}
