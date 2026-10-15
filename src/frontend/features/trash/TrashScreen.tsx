import Trash2Icon from '@cherrystudio/app-icons/icons/trash-2';
import { Button, ContentState, Tabs } from '@cherrystudio/ui/components';
import { LegendList } from '@legendapp/list/react-native';
import { useFocusEffect, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, AppState, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteHeader } from '@/frontend/appShell/header';
import { useInfiniteQuery, useQuery } from '@/frontend/data/hooks';
import { useTrashActions } from '@/frontend/hooks/trash';
import { TRASH_RETENTION_MS, type TrashFilter } from '@/shared/data/api/schemas/trash';

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
  const dateFormatter = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' });
  const fileSize = new Intl.NumberFormat(i18n.resolvedLanguage, {
    maximumFractionDigits: 1,
  }).format((summary.data?.fileBytes ?? 0) / 1_000_000);
  const categoryCount = !summary.data
    ? 0
    : filter === 'file'
      ? summary.data.files
      : filter === 'session'
        ? summary.data.sessions
        : summary.data.files + summary.data.sessions;
  const refresh = () => Promise.all([list.refresh(), summary.refetch()]);

  return (
    <>
      <RouteHeader title={t('trash.title')} />
      <View className="flex-1" style={{ paddingLeft: insets.left, paddingRight: insets.right }}>
        <LegendList
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          contentInsetAdjustmentBehavior="automatic"
          data={entries}
          recycleItems
          keyExtractor={(item) => `${item.kind}:${item.id}`}
          extraData={{ actions, dateFormatter }}
          ListHeaderComponent={
            <View className="gap-4 pt-2 pb-4">
              <Tabs
                accessibilityLabel={t('trash.categories')}
                items={filters.map((value) => ({ value, label: t(filterLabels[value]) }))}
                layout="hug"
                value={filter}
                onValueChange={setFilter}
              />
              <Text className="text-sm text-muted-foreground">{t('trash.retention')}</Text>
              {summary.error ? (
                <ContentState.Error
                  title={t('trash.loadFailed')}
                  primaryAction={{
                    children: t('common.retry'),
                    onPress: () => void summary.refetch(),
                  }}
                />
              ) : summary.data ? (
                <Text className="text-sm text-muted-foreground">
                  {t('trash.fileBytes', { size: fileSize })}
                </Text>
              ) : null}
              <View className="flex-row justify-end">
                <Button
                  variant="ghost"
                  disabled={actions.isPending || categoryCount === 0 || Boolean(summary.error)}
                  onPress={() => actions.requestEmpty(filter)}
                >
                  {t(filter === 'all' ? 'trash.emptyAll' : 'trash.emptyCategory', {
                    category: t(filterLabels[filter]),
                  })}
                </Button>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View className="gap-2 py-4">
              <View className="gap-1">
                <Text className="text-xs text-muted-foreground">{t(filterLabels[item.kind])}</Text>
                <Text className="font-medium text-base text-foreground" numberOfLines={2}>
                  {item.title || t('session.list.untitled')}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {t('trash.deletedAt', { date: dateFormatter.format(item.deletedAt) })}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {item.state === 'deleting'
                    ? t('trash.deletionPending')
                    : t('trash.remaining', {
                        days: Math.max(
                          0,
                          Math.ceil((item.deletedAt + TRASH_RETENTION_MS - now) / 86_400_000),
                        ),
                      })}
                </Text>
              </View>
              <View className="flex-row items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  disabled={actions.isPending || item.state === 'deleting'}
                  onPress={() => void actions.restore(item)}
                  accessibilityLabel={t('trash.restoreNamed', {
                    name: item.title || t('session.list.untitled'),
                  })}
                >
                  {t('trash.restore')}
                </Button>
                <Button
                  variant="ghost"
                  disabled={actions.isPending}
                  icon={<Trash2Icon />}
                  onPress={() => actions.requestDelete(item)}
                  accessibilityLabel={t('trash.deleteNamed', {
                    name: item.title || t('session.list.untitled'),
                  })}
                />
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View className="min-h-48 justify-center py-8">
              {list.isLoading ? (
                <ActivityIndicator />
              ) : list.error ? (
                <ContentState.Error
                  title={t('trash.loadFailed')}
                  primaryAction={{ children: t('common.retry'), onPress: () => void refresh() }}
                />
              ) : (
                <ContentState.Empty title={t('trash.empty')} />
              )}
            </View>
          }
          ListFooterComponent={
            entries.length > 0 && list.error ? (
              <ContentState.Error
                title={t('trash.loadFailed')}
                primaryAction={{ children: t('common.retry'), onPress: () => void refresh() }}
              />
            ) : list.isLoadingMore ? (
              <ActivityIndicator />
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
