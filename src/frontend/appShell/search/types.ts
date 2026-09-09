import type { ComponentType, ReactNode } from 'react';
import type { AccessibilityState } from 'react-native';

export type AppSearchOutcome<TItem> = { item: TItem; type: 'selected' } | { type: 'cancelled' };

export type AppSearchGroup<TItem> = {
  items: readonly TItem[];
  key: string;
  title?: string;
  /** A group-owned continuation, loaded explicitly without advancing other groups. */
  nextCursor?: string;
};

export type AppSearchPage<TItem> = {
  groups: readonly AppSearchGroup<TItem>[];
  nextCursor?: string;
};

export type AppSearchFilterProps<TFilters, TContext> = {
  context: TContext;
  onChange: (value: TFilters) => void;
  query: string;
  value: TFilters;
};

export type AppSearchFilter<TFilters, TContext = undefined> = {
  component: ComponentType<AppSearchFilterProps<TFilters, TContext>>;
  context: TContext;
  initialValue: TFilters;
};

export type AppSearchInput<TFilters = undefined> = {
  cursor?: string;
  groupKey?: string;
  filters: TFilters;
  query: string;
  signal: AbortSignal;
};

/**
 * Everything the transient search page needs to find and draw one kind of item.
 * What selecting that item means remains entirely with the caller of `open`.
 */
export type AppSearchRequest<TItem, TFilters = undefined, TFilterContext = undefined> = {
  /** Delay nonempty queries for expensive sources; local matching stays immediate by default. */
  debounceMs?: number;
  emptyText: string;
  filter?: AppSearchFilter<TFilters, TFilterContext>;
  getAccessibilityLabel: (item: TItem) => string;
  getAccessibilityState?: (item: TItem) => AccessibilityState;
  keyExtractor: (item: TItem) => string;
  loadRecent?: (
    input: Omit<AppSearchInput<TFilters>, 'query'>,
  ) => AppSearchPage<TItem> | Promise<AppSearchPage<TItem>>;
  placeholder: string;
  renderItem: (item: TItem) => ReactNode;
  search: (input: AppSearchInput<TFilters>) => AppSearchPage<TItem> | Promise<AppSearchPage<TItem>>;
};
