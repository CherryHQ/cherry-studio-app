import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import Trash2Icon from '@cherrystudio/app-icons/icons/trash-2';
import { ContentState } from '@cherrystudio/ui/components';
import { LegendList } from '@legendapp/list/react-native';
import { useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';
import { useInfiniteQuery, useQuery } from '@/frontend/data/hooks';
import { TRASH_RETENTION_MS } from '@/shared/data/api/schemas/trash';

import { TrashEntryRow } from './components/TrashEntryRow';
import { useTrashActions } from './hooks/useTrashActions';

const DAY_MS = 24 * 60 * 60 * 1000;

export function TrashScreen() {
  const { t, i18n } = useTranslation();
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
  const list = useInfiniteQuery('/trash', { enabled: focused, limit: 30 });
  const summary = useQuery('/trash/summary', { enabled: focused });
  const actions = useTrashActions();
  const entries = useMemo(() => list.pages.flatMap((page) => page.items), [list.pages]);
  const size = new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 1 }).format(
    (summary.data?.fileBytes ?? 0) / 1_000_000,
  );
  const refresh = () => Promise.all([list.refresh(), summary.refetch()]);
  const error = list.error ?? summary.error;
  const rightActions: HeaderToolbarAction[] = [
    {
      accessibilityLabel: t('common.more'),
      icon: EllipsisIcon,
      key: 'trash-menu',
      type: 'menu',
      items: [
        {
          destructive: true,
          disabled: actions.isPending || !summary.data?.files || Boolean(summary.error),
          id: 'trash-empty',
          label: t('trash.emptyAll'),
          onPress: () => actions.requestEmpty(),
        },
      ],
    },
  ];

  return (
    <>
      <RouteHeader rightActions={rightActions} title={t('trash.title')} />
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
          keyExtractor={(item) => item.id}
          extraData={{ actions, now }}
          ListHeaderComponent={
            <View className="pt-2 pb-4">
              <View className="gap-1 rounded-xl border border-border px-4 py-3">
                <Text className="text-base text-muted-foreground">{t('trash.retention')}</Text>
                {summary.data?.files ? (
                  <Text className="text-sm text-muted-foreground">
                    {t('trash.fileBytes', { size })}
                  </Text>
                ) : null}
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View className="py-3">
              <TrashEntryRow
                daysLeft={t('trash.daysLeft', {
                  count: Math.max(
                    1,
                    Math.ceil((item.deletedAt + TRASH_RETENTION_MS - now) / DAY_MS),
                  ),
                })}
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
