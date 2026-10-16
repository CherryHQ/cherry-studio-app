import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import Trash2Icon from '@cherrystudio/app-icons/icons/trash-2';
import { ContentState } from '@cherrystudio/ui/components';
import { LegendList } from '@legendapp/list/react-native';
import { useFocusEffect, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';
import { useInfiniteQuery, useQuery } from '@/frontend/data/hooks';
import { useTrashActions } from '@/frontend/hooks/trash';
import type { TrashFilter } from '@/shared/data/api/schemas/trash';

import { TrashEntryRow } from './components/TrashEntryRow';

const filters = ['all', 'session', 'file'] as const;
const filterLabels = { all: 'trash.all', session: 'trash.sessions', file: 'trash.files' };

export function TrashScreen() {
  const { t, i18n } = useTranslation();
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const [filter, setFilter] = useState<TrashFilter>(
    kind === 'file' || kind === 'session' ? kind : 'all',
  );
  const focused = useIsFocused();
  const [now, setNow] = useState(Date.now);
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') setNow(Date.now());
      });
      return () => subscription.remove();
    }, []),
  );
  const insets = useSafeAreaInsets();
  const list = useInfiniteQuery('/trash', { enabled: focused, query: { kind: filter }, limit: 30 });
  const summary = useQuery('/trash/summary', { enabled: focused });
  const actions = useTrashActions();
  const entries = useMemo(() => list.pages.flatMap((page) => page.items), [list.pages]);
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' }),
    [i18n.resolvedLanguage],
  );
  const categoryCount = !summary.data
    ? 0
    : filter === 'file'
      ? summary.data.files
      : filter === 'session'
        ? summary.data.sessions
        : summary.data.files + summary.data.sessions;
  const refresh = () => Promise.all([list.refresh(), summary.refetch()]);
  const error = list.error ?? summary.error;
  const rightActions: HeaderToolbarAction[] = [
    {
      accessibilityLabel: t('common.more'),
      icon: EllipsisIcon,
      key: 'trash-menu',
      type: 'menu',
      items: [
        ...filters.map((value) => ({
          checked: value === filter,
          group: 'filter',
          id: `trash-filter-${value}`,
          label: t(filterLabels[value]),
          onPress: () => setFilter(value),
        })),
        {
          destructive: true,
          disabled: actions.isPending || categoryCount === 0 || Boolean(summary.error),
          group: 'empty',
          id: 'trash-empty',
          label: t(filter === 'all' ? 'trash.emptyAll' : 'trash.emptyCategory', {
            category: t(filterLabels[filter]),
          }),
          onPress: () => actions.requestEmpty(filter),
        },
      ],
    },
  ];

  return (
    <>
      <RouteHeader
        rightActions={rightActions}
        title={
          filter === 'all'
            ? t('trash.title')
            : t('trash.filteredTitle', { category: t(filterLabels[filter]) })
        }
      />
      <View className="flex-1" style={{ paddingLeft: insets.left, paddingRight: insets.right }}>
        <LegendList
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 24,
          }}
          contentInsetAdjustmentBehavior="automatic"
          data={entries}
          recycleItems
          keyExtractor={(item) => `${item.kind}:${item.id}`}
          extraData={{ actions, dateFormatter, now }}
          ListHeaderComponent={
            <View className="pt-2 pb-4">
              <View className="rounded-xl border border-border px-4 py-3">
                <Text className="text-base text-muted-foreground">{t('trash.retention')}</Text>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View className="py-3">
              <TrashEntryRow
                date={
                  new Date(item.deletedAt).toDateString() === new Date(now).toDateString()
                    ? t('trash.today')
                    : dateFormatter.format(item.deletedAt)
                }
                isPending={actions.isPending}
                item={item}
                onDelete={actions.requestDelete}
                onRestore={actions.restore}
              />
            </View>
          )}
          ListEmptyComponent={
            <View className="flex-1 justify-center py-8">
              {list.isLoading ? (
                <ContentState.Loading />
              ) : error ? (
                <ContentState.Error
                  title={t('trash.loadFailed')}
                  primaryAction={{ children: t('common.retry'), onPress: () => void refresh() }}
                />
              ) : (
                <ContentState.Empty
                  icon={
                    <ContentState.Icon className="rounded-xl">
                      <Trash2Icon className="size-6 text-foreground" />
                    </ContentState.Icon>
                  }
                  title={t('trash.empty')}
                />
              )}
            </View>
          }
          ListFooterComponent={
            entries.length > 0 && error ? (
              <ContentState.Error
                title={t('trash.loadFailed')}
                primaryAction={{ children: t('common.retry'), onPress: () => void refresh() }}
              />
            ) : list.isLoadingMore ? (
              <ContentState.Loading />
            ) : null
          }
          onEndReached={() => {
            if (!list.error) void list.loadNext();
          }}
          onEndReachedThreshold={0.5}
          onRefresh={() => void refresh()}
          refreshing={list.isRefreshing && !list.isLoadingMore}
        />
      </View>
    </>
  );
}
