import { ContentState, SearchField, Spinner } from '@cherrystudio/ui/components';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteHeader } from '@/frontend/components/headers';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import {
  cancelScheduledAppSearchFinish,
  finishAppSearchSession,
  getAppSearchSession,
  scheduleAppSearchFinish,
  selectAppSearchItem,
} from './appSearchSession';
import type { AppSearchGroup, AppSearchPage, AppSearchRequest } from './types';

const SEARCH_RESULT_ESTIMATED_HEIGHT = 52;

type SearchPhase = 'idle' | 'loading' | 'ready' | 'error';
type StoredSearchRequest = AppSearchRequest<unknown, unknown, unknown>;
type AppSearchNavigation = {
  addListener: (
    event: 'transitionEnd',
    listener: (event: { data: { closing: boolean } }) => void,
  ) => () => void;
};

type AppSearchListItem =
  | { key: string; title: string; type: 'header' }
  | { item: unknown; key: string; type: 'result' };

export default function AppSearchScreen() {
  const params = useLocalSearchParams<{ searchSessionId?: string | string[] }>();
  const searchSessionId = getSingleRouteParam(params.searchSessionId);
  const session = getAppSearchSession(searchSessionId);
  const router = useRouter();
  const navigation = useNavigation<AppSearchNavigation>();

  useEffect(() => {
    if (!searchSessionId || !session) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
      return;
    }

    cancelScheduledAppSearchFinish(searchSessionId);
    const unsubscribe = navigation.addListener('transitionEnd', (event) => {
      if (event.data.closing) {
        finishAppSearchSession(searchSessionId);
      }
    });

    return () => {
      unsubscribe();
      scheduleAppSearchFinish(searchSessionId);
    };
  }, [navigation, router, searchSessionId, session]);

  if (!searchSessionId || !session) {
    return null;
  }

  return <AppSearchRoutePage request={session.request} searchSessionId={searchSessionId} />;
}

function AppSearchRoutePage({
  request,
  searchSessionId,
}: {
  request: StoredSearchRequest;
  searchSessionId: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(() => request.filter?.initialValue);
  const [groups, setGroups] = useState<readonly AppSearchGroup<unknown>[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [phase, setPhase] = useState<SearchPhase>('idle');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const requestNumberRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  const paginationAbortRef = useRef<AbortController | null>(null);
  const isLeavingRef = useRef(false);

  useEffect(() => {
    const searchQuery = query.trim();
    if (!searchQuery) {
      return;
    }

    const requestNumber = ++requestNumberRef.current;
    const abortController = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = abortController;
    paginationAbortRef.current?.abort();

    void Promise.resolve()
      .then(() => request.search({ filters, query: searchQuery, signal: abortController.signal }))
      .then(
        (page) => {
          if (abortController.signal.aborted || requestNumber !== requestNumberRef.current) {
            return;
          }

          setGroups(page.groups);
          setNextCursor(page.nextCursor);
          setPhase('ready');
        },
        () => {
          if (abortController.signal.aborted || requestNumber !== requestNumberRef.current) {
            return;
          }

          setGroups([]);
          setNextCursor(undefined);
          setPhase('error');
        },
      );

    return () => abortController.abort();
  }, [filters, query, reloadVersion, request]);

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
      paginationAbortRef.current?.abort();
    },
    [],
  );

  const listItems = useMemo(() => buildListItems(groups, request), [groups, request]);
  const handleQueryChange = useCallback((value: string) => {
    searchAbortRef.current?.abort();
    paginationAbortRef.current?.abort();
    requestNumberRef.current += 1;
    setQuery(value);
    setGroups([]);
    setNextCursor(undefined);
    setPhase(value.trim() ? 'loading' : 'idle');
    setIsLoadingMore(false);
  }, []);
  const clearQuery = useCallback(() => handleQueryChange(''), [handleQueryChange]);
  const handleFiltersChange = useCallback(
    (value: unknown) => {
      searchAbortRef.current?.abort();
      paginationAbortRef.current?.abort();
      requestNumberRef.current += 1;
      setFilters(value);
      setGroups([]);
      setNextCursor(undefined);
      setPhase(query.trim() ? 'loading' : 'idle');
      setIsLoadingMore(false);
    },
    [query],
  );
  const handleSelect = useCallback(
    (item: unknown) => {
      if (isLeavingRef.current) {
        return;
      }

      isLeavingRef.current = true;
      selectAppSearchItem(searchSessionId, item);
      router.back();
    },
    [router, searchSessionId],
  );
  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<AppSearchListItem>) => {
      if (item.type === 'header') {
        return (
          <View className="px-4 pt-4 pb-1">
            <Text className="font-medium text-muted-foreground text-sm">{item.title}</Text>
          </View>
        );
      }

      return (
        <Pressable
          accessibilityLabel={request.getAccessibilityLabel(item.item)}
          accessibilityRole="button"
          accessibilityState={request.getAccessibilityState?.(item.item)}
          className="min-h-12 justify-center px-4 active:bg-foreground/5"
          onPress={() => handleSelect(item.item)}
        >
          {request.renderItem(item.item)}
        </Pressable>
      );
    },
    [handleSelect, request],
  );
  const loadMore = useCallback(() => {
    if (!nextCursor || isLoadingMore || phase !== 'ready') {
      return;
    }

    const cursor = nextCursor;
    const requestNumber = requestNumberRef.current;
    const abortController = new AbortController();
    paginationAbortRef.current?.abort();
    paginationAbortRef.current = abortController;
    setIsLoadingMore(true);

    void Promise.resolve()
      .then(() =>
        request.search({
          cursor,
          filters,
          query: query.trim(),
          signal: abortController.signal,
        }),
      )
      .then(
        (page) => {
          if (abortController.signal.aborted || requestNumber !== requestNumberRef.current) {
            return;
          }

          setGroups((current) => mergeSearchGroups(current, page, request.keyExtractor));
          setNextCursor(page.nextCursor);
          setIsLoadingMore(false);
        },
        () => {
          if (!abortController.signal.aborted && requestNumber === requestNumberRef.current) {
            setIsLoadingMore(false);
          }
        },
      );
  }, [filters, isLoadingMore, nextCursor, phase, query, request]);
  const retry = useCallback(() => {
    setPhase('loading');
    setReloadVersion((current) => current + 1);
  }, []);
  const FilterComponent = request.filter?.component;

  return (
    <>
      <RouteHeader title={t('navigation.search')} />
      <View className="flex-1 bg-background">
        <View className={request.filter ? 'px-4 pt-3 pb-2' : 'px-4 py-3'}>
          <SearchField
            accessibilityLabel={request.placeholder}
            autoFocus
            clearAccessibilityLabel={t('common.clear')}
            onChangeText={handleQueryChange}
            onClear={clearQuery}
            placeholder={request.placeholder}
            testID="app-search-input"
            value={query}
          />
        </View>
        {request.filter && FilterComponent ? (
          <View className="px-4 pb-3">
            <FilterComponent
              context={request.filter.context}
              onChange={handleFiltersChange}
              query={query.trim()}
              value={filters}
            />
          </View>
        ) : null}
        {phase === 'idle' ? (
          <View className="flex-1" />
        ) : phase === 'loading' && listItems.length === 0 ? (
          <ContentState.Loading className="flex-1 px-6" title={t('appSearch.loading')} />
        ) : phase === 'error' && listItems.length === 0 ? (
          <ContentState.Error
            className="flex-1 px-6"
            primaryAction={{ children: t('appSearch.retry'), onPress: retry }}
            title={t('appSearch.loadFailed')}
          />
        ) : (
          <LegendList
            contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
            data={listItems}
            estimatedItemSize={SEARCH_RESULT_ESTIMATED_HEIGHT}
            getItemType={getListItemType}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            keyExtractor={listKeyExtractor}
            ListEmptyComponent={
              <ContentState.Empty className="px-6 py-12" description={request.emptyText} />
            }
            ListFooterComponent={
              isLoadingMore ? (
                <View className="items-center py-4">
                  <Spinner accessibilityLabel={t('appSearch.loading')} />
                </View>
              ) : null
            }
            maintainVisibleContentPosition={false}
            onEndReached={loadMore}
            onEndReachedThreshold={0.7}
            recycleItems
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            style={styles.list}
          />
        )}
      </View>
    </>
  );
}

function buildListItems(
  groups: readonly AppSearchGroup<unknown>[],
  request: StoredSearchRequest,
): AppSearchListItem[] {
  return groups.flatMap((group) => [
    ...(group.title
      ? [{ key: `header:${group.key}`, title: group.title, type: 'header' as const }]
      : []),
    ...group.items.map((item) => ({
      item,
      key: `result:${group.key}:${request.keyExtractor(item)}`,
      type: 'result' as const,
    })),
  ]);
}

function mergeSearchGroups(
  currentGroups: readonly AppSearchGroup<unknown>[],
  page: AppSearchPage<unknown>,
  keyExtractor: (item: unknown) => string,
): readonly AppSearchGroup<unknown>[] {
  const pageGroups = new Map(page.groups.map((group) => [group.key, group]));
  const mergedGroups = currentGroups.map((group) => {
    const incoming = pageGroups.get(group.key);
    if (!incoming) {
      return group;
    }

    pageGroups.delete(group.key);
    const existingKeys = new Set(group.items.map(keyExtractor));
    return {
      ...group,
      items: [
        ...group.items,
        ...incoming.items.filter((item) => !existingKeys.has(keyExtractor(item))),
      ],
      title: incoming.title ?? group.title,
    };
  });

  return [...mergedGroups, ...pageGroups.values()];
}

function listKeyExtractor(item: AppSearchListItem) {
  return item.key;
}

function getListItemType(item: AppSearchListItem) {
  return item.type;
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { flexGrow: 1 },
});
