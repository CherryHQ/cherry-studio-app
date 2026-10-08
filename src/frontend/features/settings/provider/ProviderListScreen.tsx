import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import { type MenuItem, Section, Spinner, useToast } from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import { cn } from '@cherrystudio/ui/utils';
import { AnimatedLegendList } from '@legendapp/list/reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { LinearTransition, ReduceMotion, useReducedMotion } from 'react-native-reanimated';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';
import { InlineSearch } from '@/frontend/components/InlineSearch';
import { useInfiniteQuery, useMutation, useQuery } from '@/frontend/data';
import { matchesSearchKeywords, toSearchKeywords } from '@/frontend/utils/search';
import type { Provider } from '@/shared/data/types/provider';

import { SettingsGroupedSeparator } from '../components/SettingsServiceRow';
import { ProviderListRow } from './components/ProviderListRow';
import { useProviderSetup } from './hooks/useProviderSetup';
import { PROVIDER_LIST_PAGE_SIZE, PROVIDER_LIST_STALE_TIME } from './providerListQuery';

const PROVIDER_ROW_ESTIMATED_HEIGHT = 56;
const providerListTransition = LinearTransition.duration(duration.base)
  .easing(easing.settle)
  .reduceMotion(ReduceMotion.System);

type ProviderListItem =
  | { id: string; kind: 'header'; isFirst: boolean; title: string }
  | {
      id: string;
      kind: 'provider';
      provider: Provider;
      isEnabled: boolean;
      isFirst: boolean;
      isLast: boolean;
      isPending: boolean;
    };

const keyExtractor = (item: ProviderListItem) => `${item.kind}:${item.id}`;
const getItemType = (item: ProviderListItem) => item.kind;

export default function ProviderListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { isPreparing, openSetup } = useProviderSetup();
  const reducedMotion = useReducedMotion();
  const isNavigatingRef = useRef(false);
  const hasFocusedOnceRef = useRef(false);
  const pendingProviderIdsRef = useRef(new Set<string>());
  const [query, setQuery] = useState('');
  const [pendingProviderStates, setPendingProviderStates] = useState<ReadonlyMap<string, boolean>>(
    new Map(),
  );
  const keywords = useMemo(() => toSearchKeywords(query), [query]);
  const isFiltering = keywords.length > 0;
  const hasPendingProviderUpdate = pendingProviderStates.size > 0;

  useFocusEffect(() => {
    if (!hasFocusedOnceRef.current) {
      hasFocusedOnceRef.current = true;
      return;
    }
    isNavigatingRef.current = false;
  });

  const updateProviderEnabledMutation = useMutation('PATCH', '/providers/:id', {
    refresh: ({ args }) =>
      args
        ? ['/providers', '/providers/page', `/providers/${args.params.id}`]
        : ['/providers', '/providers/page'],
  });
  const updateProviderEnabled = updateProviderEnabledMutation.trigger;
  const toggleProviderEnabled = useCallback(
    (provider: Provider, isEnabled: boolean) => {
      if (
        provider.isEnabled === isEnabled ||
        pendingProviderIdsRef.current.has(provider.id) ||
        (isEnabled && isPreparing)
      ) {
        return;
      }

      pendingProviderIdsRef.current.add(provider.id);
      setPendingProviderStates((current) => new Map(current).set(provider.id, isEnabled));

      const update = isEnabled
        ? openSetup(provider.id, '/settings/provider')
        : updateProviderEnabled({
            body: { isEnabled },
            params: { id: provider.id },
          })
            .then(() => {
              toast.show({
                label: t('settings.provider.toast.disabled', { name: provider.name }),
                variant: 'success',
              });
            })
            .catch(() => {
              toast.show({ label: t('settings.provider.toast.toggleFailed'), variant: 'danger' });
            });

      void update.finally(() => {
        pendingProviderIdsRef.current.delete(provider.id);
        setPendingProviderStates((current) => {
          const next = new Map(current);
          next.delete(provider.id);
          return next;
        });
      });
    },
    [isPreparing, openSetup, t, toast, updateProviderEnabled],
  );

  const providersPageQuery = useInfiniteQuery('/providers/page', {
    limit: PROVIDER_LIST_PAGE_SIZE,
    staleTime: PROVIDER_LIST_STALE_TIME,
  });
  const loadNextProviderPage = providersPageQuery.loadNext;
  const pagedProviders = useMemo(
    () => providersPageQuery.pages.flatMap((page) => page.items),
    [providersPageQuery.pages],
  );
  const allProvidersQuery = useQuery('/providers', {
    enabled: isFiltering,
    staleTime: PROVIDER_LIST_STALE_TIME,
  });
  const listedProviders = useMemo(() => {
    const providers = isFiltering ? (allProvidersQuery.data ?? pagedProviders) : pagedProviders;
    return isFiltering
      ? providers.filter((provider) => matchesSearchKeywords(keywords, [provider.name]))
      : providers;
  }, [allProvidersQuery.data, isFiltering, keywords, pagedProviders]);
  const openProvider = useCallback(
    (provider: Provider) => {
      if (isNavigatingRef.current) {
        return;
      }

      isNavigatingRef.current = true;
      router.push({
        pathname: '/settings/provider/[providerId]',
        params: { providerId: provider.id, providerName: provider.name },
      });
    },
    [router],
  );
  const providerItems = useMemo<ProviderListItem[]>(() => {
    const items: ProviderListItem[] = [];
    for (const isEnabled of [true, false]) {
      // Move once, using the persisted order after refresh. The switch responds immediately.
      const providers = listedProviders.filter((provider) => provider.isEnabled === isEnabled);
      if (providers.length === 0) continue;

      items.push({
        id: isEnabled ? 'enabled' : 'disabled',
        kind: 'header',
        isFirst: items.length === 0,
        title: t(
          isEnabled ? 'settings.provider.section.enabled' : 'settings.provider.section.disabled',
          { count: providers.length },
        ),
      });
      providers.forEach((provider, index) => {
        items.push({
          id: provider.id,
          kind: 'provider',
          provider,
          isEnabled: pendingProviderStates.get(provider.id) ?? provider.isEnabled,
          isFirst: index === 0,
          isLast: index === providers.length - 1,
          isPending: pendingProviderStates.has(provider.id),
        });
      });
    }
    return items;
  }, [listedProviders, pendingProviderStates, t]);
  const renderProviderItem = useCallback(
    ({ item }: { item: ProviderListItem }) =>
      item.kind === 'header' ? (
        // Mirrors a titled `Section`: the title sits 12pt inside the card edge, 4pt above it.
        <View className={cn('px-7 pb-1', item.isFirst ? 'pt-2' : 'pt-6')}>
          <Section.Header accessibilityRole="header" title={item.title} />
        </View>
      ) : (
        // Each row draws its slice of the group's card, so the list can stay virtualized.
        <View
          className={cn(
            'mx-4 overflow-hidden bg-card',
            item.isFirst && 'rounded-t-2xl',
            item.isLast && 'rounded-b-2xl',
          )}
          style={styles.cardSlice}
        >
          {item.isFirst ? null : <SettingsGroupedSeparator />}
          <ProviderListRow
            isEnabled={item.isEnabled}
            isPending={item.isPending}
            onOpen={openProvider}
            onToggle={toggleProviderEnabled}
            provider={item.provider}
          />
        </View>
      ),
    [openProvider, toggleProviderEnabled],
  );
  const loadMoreProviders = useCallback(() => {
    if (!isFiltering && !hasPendingProviderUpdate) {
      void loadNextProviderPage();
    }
  }, [hasPendingProviderUpdate, isFiltering, loadNextProviderPage]);
  const listFooter = useMemo(
    () =>
      providersPageQuery.isLoadingMore || (isFiltering && allProvidersQuery.isPending) ? (
        <View className="h-16 items-center justify-center">
          <Spinner accessibilityLabel={t('settings.provider.loading')} />
        </View>
      ) : null,
    [allProvidersQuery.isPending, isFiltering, providersPageQuery.isLoadingMore, t],
  );
  const openProviderCatalog = useCallback(() => {
    router.push('/settings/provider/catalog');
  }, [router]);
  const openDesktopSync = useCallback(() => {
    router.push('/settings/provider/desktop-sync');
  }, [router]);
  const menuItems = useMemo<readonly MenuItem[]>(
    () => [
      {
        id: 'open-provider-catalog',
        label: t('settings.provider.actions.add'),
        onPress: openProviderCatalog,
      },
      {
        id: 'sync-from-desktop',
        label: t('settings.provider.desktopSync.menuLabel'),
        onPress: openDesktopSync,
      },
    ],
    [openDesktopSync, openProviderCatalog, t],
  );
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.more'),
        icon: EllipsisIcon,
        items: menuItems,
        key: 'provider-actions',
        testID: 'provider-actions',
        type: 'menu',
      },
    ],
    [menuItems, t],
  );

  return (
    <>
      <RouteHeader rightActions={rightActions} title={t('settings.pages.provider.title')} />
      <InlineSearch onChangeText={setQuery} value={query} />
      <View className="flex-1 px-4 pb-5">
        {providerItems.length > 0 ? (
          <View className="-mx-4 min-h-0 flex-1">
            <AnimatedLegendList
              alwaysBounceVertical={false}
              data={providerItems}
              estimatedItemSize={PROVIDER_ROW_ESTIMATED_HEIGHT}
              getItemType={getItemType}
              itemLayoutAnimation={reducedMotion ? undefined : providerListTransition}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              keyExtractor={keyExtractor}
              ListFooterComponent={listFooter}
              maintainVisibleContentPosition={false}
              onEndReached={loadMoreProviders}
              onEndReachedThreshold={0.7}
              recycleItems
              renderItem={renderProviderItem}
              showsVerticalScrollIndicator={false}
              style={styles.list}
              testID="provider-list"
            />
          </View>
        ) : (
          <Section>
            <Section.Item
              label={
                providersPageQuery.isLoading || (isFiltering && allProvidersQuery.isPending)
                  ? t('settings.provider.loading')
                  : t('settings.provider.search.empty')
              }
            />
          </Section>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  cardSlice: {
    borderCurve: 'continuous',
  },
  list: {
    flex: 1,
  },
});
