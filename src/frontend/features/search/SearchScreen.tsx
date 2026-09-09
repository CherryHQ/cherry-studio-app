import XIcon from '@cherrystudio/app-icons/icons/x';
import { Button, ContentState, SearchField, Spinner, Surface } from '@cherrystudio/ui/components';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  cancelScheduledAppSearchFinish,
  finishAppSearchSession,
  getAppSearchSession,
  scheduleAppSearchFinish,
  selectAppSearchItem,
  type AppSearchGroup,
  type AppSearchPage,
  type AppSearchRequest,
} from '@/frontend/appShell/search';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

const SEARCH_RESULT_ESTIMATED_HEIGHT = 72;

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

export default function SearchScreen() {
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
  const [phase, setPhase] = useState<SearchPhase>(request.loadRecent ? 'loading' : 'idle');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const requestNumberRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  const paginationAbortRef = useRef<AbortController | null>(null);
  const isLeavingRef = useRef(false);

  useEffect(() => {
    const searchQuery = query.trim();
    const loadPage = searchQuery ? request.search : request.loadRecent;
    if (!loadPage) {
      return;
    }

    const requestNumber = ++requestNumberRef.current;
    const abortController = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = abortController;
    paginationAbortRef.current?.abort();

    const input = { filters, query: searchQuery, signal: abortController.signal };
    void Promise.resolve()
      .then(() => loadPage(input))
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
  const handleQueryChange = useCallback(
    (value: string) => {
      searchAbortRef.current?.abort();
      paginationAbortRef.current?.abort();
      requestNumberRef.current += 1;
      setQuery(value);
      setGroups([]);
      setNextCursor(undefined);
      setPhase(value.trim() || request.loadRecent ? 'loading' : 'idle');
      setIsLoadingMore(false);
    },
    [request.loadRecent],
  );
  const clearQuery = useCallback(() => handleQueryChange(''), [handleQueryChange]);
  const handleFiltersChange = useCallback(
    (value: unknown) => {
      searchAbortRef.current?.abort();
      paginationAbortRef.current?.abort();
      requestNumberRef.current += 1;
      setFilters(value);
      setGroups([]);
      setNextCursor(undefined);
      setPhase(query.trim() || request.loadRecent ? 'loading' : 'idle');
      setIsLoadingMore(false);
    },
    [query, request.loadRecent],
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
  const handleClose = useCallback(() => {
    if (isLeavingRef.current) return;
    isLeavingRef.current = true;
    router.back();
  }, [router]);
  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<AppSearchListItem>) => {
      if (item.type === 'header') {
        return (
          <View className="px-5 pt-4 pb-2">
            <Text accessibilityRole="header" className="font-medium text-base text-foreground">
              {item.title}
            </Text>
          </View>
        );
      }

      return (
        <Pressable
          accessibilityLabel={request.getAccessibilityLabel(item.item)}
          accessibilityRole="button"
          accessibilityState={request.getAccessibilityState?.(item.item)}
          className="min-h-12 justify-center px-5 active:bg-foreground/5"
          onPress={() => handleSelect(item.item)}
        >
          {request.renderItem(item.item)}
        </Pressable>
      );
    },
    [handleSelect, request],
  );
  const loadMore = useCallback(() => {
    const searchQuery = query.trim();
    const loadPage = searchQuery ? request.search : request.loadRecent;
    if (!loadPage || !nextCursor || isLoadingMore || phase !== 'ready') {
      return;
    }

    const cursor = nextCursor;
    const requestNumber = requestNumberRef.current;
    const abortController = new AbortController();
    paginationAbortRef.current?.abort();
    paginationAbortRef.current = abortController;
    setIsLoadingMore(true);

    const input = { cursor, filters, query: searchQuery, signal: abortController.signal };
    void Promise.resolve()
      .then(() => loadPage(input))
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
    <KeyboardAvoidingView
      behavior="padding"
      // The dock already includes this inset; keep its 12px gap when the keyboard replaces it.
      keyboardVerticalOffset={-insets.bottom}
      style={styles.page}
    >
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        {request.filter && FilterComponent ? (
          <View className="px-5 pt-4 pb-3">
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
          <View className="flex-1 justify-center px-6">
            <ContentState.Loading title={t('appSearch.loading')} />
          </View>
        ) : phase === 'error' && listItems.length === 0 ? (
          <View className="flex-1 justify-center px-6">
            <ContentState.Error
              primaryAction={{ children: t('appSearch.retry'), onPress: retry }}
              title={t('appSearch.loadFailed')}
            />
          </View>
        ) : (
          <LegendList
            contentContainerStyle={styles.listContent}
            data={listItems}
            estimatedItemSize={SEARCH_RESULT_ESTIMATED_HEIGHT}
            getItemType={getListItemType}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            keyExtractor={listKeyExtractor}
            ListEmptyComponent={
              query.trim() ? (
                <View className="px-6 py-12">
                  <ContentState.Empty description={request.emptyText} />
                </View>
              ) : null
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
        <View
          className="flex-row items-center gap-3 px-4 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <SearchField
            accessibilityLabel={request.placeholder}
            autoFocus
            clearAccessibilityLabel={t('common.clear')}
            onChangeText={handleQueryChange}
            onClear={clearQuery}
            placeholder={request.placeholder}
            style={styles.searchField}
            testID="app-search-input"
            value={query}
            variant="filled"
          />
          <Surface interactive shape="circle">
            <Button
              accessibilityLabel={t('common.close')}
              icon={<XIcon />}
              onPress={handleClose}
              shape="pill"
              size="lg"
              testID="app-search-close"
              variant="ghost"
            />
          </Surface>
        </View>
      </View>
    </KeyboardAvoidingView>
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
  page: { flex: 1 },
  list: { flex: 1 },
  listContent: { flexGrow: 1, paddingBottom: 12 },
  searchField: { flex: 1 },
});
