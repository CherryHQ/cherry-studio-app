import { useMemo, useState } from 'react';

import { matchesSearchKeywords, toSearchKeywords } from '@/frontend/utils/search';

export type InlineSearchOptions<T> = {
  /**
   * The fields one item's query is compared against.
   *
   * They are joined into a single haystack, so a query may span them. React
   * Compiler memoizes an inline arrow here; callers do not need `useCallback`.
   */
  fields: (item: T) => readonly (string | null | undefined)[];
  items: readonly T[];
};

export type InlineSearchState<T> = {
  /**
   * True once the query holds something other than whitespace.
   *
   * Screens use this to tell "no rows because nothing matched" apart from "no
   * rows because there is nothing yet", which need different empty states.
   */
  isFiltering: boolean;
  query: string;
  results: readonly T[];
  setQuery: (value: string) => void;
};

/**
 * Owns the query and the filtering behind an inline search field.
 *
 * The screen keeps the field itself — `InlineSearch` draws it — because where
 * it goes and when it unmounts are the screen's decisions, not this hook's.
 */
export function useInlineSearch<T>({
  fields,
  items,
}: InlineSearchOptions<T>): InlineSearchState<T> {
  const [query, setQuery] = useState('');
  const keywords = useMemo(() => toSearchKeywords(query), [query]);
  const results = useMemo(
    () =>
      keywords.length === 0
        ? items
        : items.filter((item) => matchesSearchKeywords(keywords, fields(item))),
    [fields, items, keywords],
  );

  return { isFiltering: keywords.length > 0, query, results, setQuery };
}
