import XIcon from '@cherrystudio/app-icons/icons/x';
import { Button, ContentState, SearchField, Spinner, Surface } from '@cherrystudio/ui/components';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { createContext, use, useCallback, useEffect, useMemo, useRef } from 'react';
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
  type AppSearchRequest,
} from '@/frontend/appShell/search';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import { useAppSearchResults } from './useAppSearchResults';

const SEARCH_RESULT_ESTIMATED_HEIGHT = 72;

const SearchPaginationContext = createContext<Pick<
  ReturnType<typeof useAppSearchResults>,
  'loadingGroupKey' | 'loadMore'
> | null>(null);

type StoredSearchRequest = AppSearchRequest<unknown, unknown, unknown>;
type AppSearchNavigation = {
  addListener: (
    event: 'transitionEnd',
    listener: (event: { data: { closing: boolean } }) => void,
  ) => () => void;
};

type AppSearchListItem =
  | { key: string; title: string; type: 'header' }
  | { item: unknown; key: string; type: 'result' }
  | { groupKey: string; hasResults: boolean; key: string; type: 'more' };

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
  const {
    changeFilters: handleFiltersChange,
    changeQuery: handleQueryChange,
    filters,
    groups,
    loadingGroupKey,
    loadMore,
    phase,
    query,
    retry,
  } = useAppSearchResults(request);
  const pagination = useMemo(() => ({ loadingGroupKey, loadMore }), [loadingGroupKey, loadMore]);
  const isLeavingRef = useRef(false);
  const listItems = useMemo(() => buildListItems(groups, request), [groups, request]);
  const clearQuery = useCallback(() => handleQueryChange(''), [handleQueryChange]);
  const handleEndReached = useCallback(() => loadMore(), [loadMore]);
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

      if (item.type === 'more') {
        return <SearchGroupContinuation groupKey={item.groupKey} hasResults={item.hasResults} />;
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
  const FilterComponent = request.filter?.component;

  return (
    <SearchPaginationContext value={pagination}>
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
                loadingGroupKey === null ? (
                  <View className="items-center py-4">
                    <Spinner accessibilityLabel={t('appSearch.loading')} />
                  </View>
                ) : null
              }
              maintainVisibleContentPosition
              onEndReached={handleEndReached}
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
    </SearchPaginationContext>
  );
}

function SearchGroupContinuation({
  groupKey,
  hasResults,
}: {
  groupKey: string;
  hasResults: boolean;
}) {
  const { t } = useTranslation();
  const pagination = use(SearchPaginationContext);
  if (!pagination) return null;
  return (
    <View className="items-start px-5 py-3">
      <Button
        disabled={pagination.loadingGroupKey !== undefined}
        loading={pagination.loadingGroupKey === groupKey}
        onPress={() => pagination.loadMore(groupKey)}
        variant="ghost"
      >
        {t(hasResults ? 'appSearch.loadMore' : 'appSearch.continueSearch')}
      </Button>
    </View>
  );
}

function buildListItems(
  groups: readonly AppSearchGroup<unknown>[],
  request: StoredSearchRequest,
): AppSearchListItem[] {
  return groups
    .filter((group) => group.items.length > 0 || group.nextCursor)
    .flatMap((group) => [
      ...(group.title
        ? [{ key: `header:${group.key}`, title: group.title, type: 'header' as const }]
        : []),
      ...group.items.map((item) => ({
        item,
        key: `result:${group.key}:${request.keyExtractor(item)}`,
        type: 'result' as const,
      })),
      ...(group.nextCursor
        ? [
            {
              groupKey: group.key,
              hasResults: group.items.length > 0,
              key: `more:${group.key}`,
              type: 'more' as const,
            },
          ]
        : []),
    ]);
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
