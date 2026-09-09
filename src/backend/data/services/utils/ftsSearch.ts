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
const SHORT_SEARCH_MAX_CANDIDATES = 500;
const logger = loggerService.withContext('FtsSearch');

export type SearchCursor = { createdAt: number; id: string };
export type SearchFetchContext = {
  chunkSize: number;
  createdAtFromMs: number | undefined;
  cursor: SearchCursor | undefined;
  ftsConditions: SQL[];
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
  getCursor: (row: Row) => SearchCursor;
  getSearchableText: (row: Row) => string;
  limit?: number;
  mapRow: (row: Row, context: SearchMapContext) => SearchMappedItem<PublicItem>;
  maxCandidates?: number;
  q: string;
  signal?: AbortSignal;
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
  getCursor,
  getSearchableText,
  limit = defaultFtsSearchLimit,
  mapRow,
  maxCandidates = ftsSearchMaxCandidates,
  q,
  signal,
}: SearchWithCursorOptions<Row, PublicItem>): Promise<CursorPaginationResponse<PublicItem>> {
  const terms = splitKeywordsToTerms(q);
  if (terms.length === 0) return { items: [] };

  const matchMode: KeywordMatchMode = 'substring';
  const fetchLimit = limit + 1;
  const regexes = buildKeywordRegexes(terms, { flags: 'i', matchMode });
  // Short words and literal SQL wildcards cannot use this LIKE index safely.
  // Scan them in bounded chronological batches and apply literal matching below.
  const indexedTerms = terms.filter((term) => Array.from(term).length >= 3 && !/[%_]/.test(term));
  const ftsConditions = indexedTerms.map(
    (term) => sql`fts.searchable_text LIKE ${buildFtsLikePattern(term)}`,
  );
  let cursor = rawCursor !== undefined ? decodeSearchCursor(rawCursor, cursorConfig) : undefined;
  const createdAtFromMs = getCreatedAtFromMs(createdAtFrom);
  const results: SearchMappedItem<PublicItem>[] = [];
  let scannedCandidates = 0;
  let exhausted = false;
  const candidateBudget =
    ftsConditions.length > 0 ? maxCandidates : Math.min(maxCandidates, SHORT_SEARCH_MAX_CANDIDATES);

  while (results.length < fetchLimit && scannedCandidates < candidateBudget) {
    signal?.throwIfAborted();
    const chunkSize = Math.min(ftsSearchChunkSize, candidateBudget - scannedCandidates);
    const rows = await fetchRows({
      chunkSize,
      createdAtFromMs,
      cursor,
      ftsConditions,
    });
    signal?.throwIfAborted();
    exhausted = rows.length < chunkSize;
    if (rows.length === 0) break;
    scannedCandidates += rows.length;

    for (const row of rows) {
      cursor = getCursor(row);
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

    if (exhausted) break;
    if (scannedCandidates >= candidateBudget && results.length < fetchLimit) {
      logger.debug('Search candidate scan continues on the next page', {
        limit,
        maxCandidates: candidateBudget,
        scannedCandidates,
        termCount: terms.length,
      });
      break;
    }
  }

  const itemsWithCursor = results.slice(0, limit);
  const nextCursorBoundary =
    results.length > limit ? itemsWithCursor.at(-1)?.sort : !exhausted ? cursor : undefined;
  return {
    items: itemsWithCursor.map((result) => result.item),
    nextCursor: nextCursorBoundary
      ? encodeSearchCursor(nextCursorBoundary.createdAt, nextCursorBoundary.id)
      : undefined,
  };
}
