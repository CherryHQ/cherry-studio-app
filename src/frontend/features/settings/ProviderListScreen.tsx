import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import { Section, Spinner, useAlert, useToast } from '@cherrystudio/ui/components';
import { SectionList } from '@legendapp/list/section-list';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import { InlineSearch } from '@/frontend/components/inlineSearch';
import { useInfiniteQuery, useMutation, useQuery } from '@/frontend/data';
import { matchesSearchKeywords, toSearchKeywords } from '@/frontend/utils/search';
import type { Provider } from '@/shared/data/types/provider';

import { ProviderAvatar } from './components/ProviderAvatar';
import { SettingsServiceRow, type SettingsServiceRowProps } from './components/SettingsServiceRow';
import { PROVIDER_LIST_PAGE_SIZE, PROVIDER_LIST_STALE_TIME } from './providerListQuery';

const PROVIDER_ROW_ESTIMATED_HEIGHT = 50;
const PROVIDER_SECTION_HEADER_ESTIMATED_HEIGHT = 48;

type ProviderListRow = SettingsServiceRowProps & {
  isEnabled: boolean;
};
type ProviderListSection = { data: ProviderListRow[]; title: string };

const keyExtractor = (item: ProviderListRow) => item.id;
const renderProviderRow = ({ item }: { item: ProviderListRow }) => {
  const { isEnabled: _isEnabled, ...row } = item;
  return <SettingsServiceRow {...row} />;
};
const renderProviderSectionHeader = ({ section }: { section: ProviderListSection }) => (
  <View className="h-12 justify-end px-4 pb-2">
    <Text className="font-medium text-foreground-tertiary text-sm">{section.title}</Text>
  </View>
);

export default function ProviderSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const { toast } = useToast();
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
      if (provider.isEnabled === isEnabled || pendingProviderIdsRef.current.has(provider.id)) {
        return;
      }

      pendingProviderIdsRef.current.add(provider.id);
      setPendingProviderStates((current) => new Map(current).set(provider.id, isEnabled));

      void updateProviderEnabled({
        body: { isEnabled },
        params: { id: provider.id },
      })
        .then(() => {
          toast.show({
            label: t(
              isEnabled ? 'settings.provider.toast.enabled' : 'settings.provider.toast.disabled',
              { name: provider.name },
            ),
            variant: 'success',
          });
        })
        .catch(() => {
          alert.show({ title: t('settings.provider.toast.toggleFailed') });
        })
        .finally(() => {
          pendingProviderIdsRef.current.delete(provider.id);
          setPendingProviderStates((current) => {
            const next = new Map(current);
            next.delete(provider.id);
            return next;
          });
        });
    },
    [alert, t, toast, updateProviderEnabled],
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
  const providerItems = useMemo<ProviderListRow[]>(
    () =>
      listedProviders.map((provider) => {
        const displayedEnabled = pendingProviderStates.get(provider.id) ?? provider.isEnabled;

        return {
          avatar: (
            <ProviderAvatar
              presetProviderId={provider.presetProviderId}
              providerId={provider.id}
              providerName={provider.name}
            />
          ),
          enabledSwitch: {
            accessibilityLabel: t(
              displayedEnabled
                ? 'settings.provider.disableProviderNamed'
                : 'settings.provider.enableProviderNamed',
              { name: provider.name },
            ),
            disabled: pendingProviderStates.has(provider.id),
            onValueChange: (isEnabled) => toggleProviderEnabled(provider, isEnabled),
            testID: `provider-enabled-switch-${provider.id}`,
            value: displayedEnabled,
          },
          id: provider.id,
          isEnabled: provider.isEnabled,
          name: provider.name,
          onPress: () => openProvider(provider),
        };
      }),
    [listedProviders, openProvider, pendingProviderStates, t, toggleProviderEnabled],
  );
  const providerSections = useMemo<ProviderListSection[]>(() => {
    const enabledProviders = providerItems.filter(({ isEnabled }) => isEnabled);
    const disabledProviders = providerItems.filter(({ isEnabled }) => !isEnabled);

    return [
      {
        data: enabledProviders,
        title: t('settings.provider.section.enabled', {
          count: enabledProviders.length,
        }),
      },
      {
        data: disabledProviders,
        title: t('settings.provider.section.disabled', {
          count: disabledProviders.length,
        }),
      },
    ].filter(({ data }) => data.length > 0);
  }, [providerItems, t]);
  const measuredItemCount = providerItems.length + providerSections.length;
  const [measuredList, setMeasuredList] = useState<{ height: number; itemCount: number }>();
  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => setMeasuredList({ height, itemCount: measuredItemCount }),
    [measuredItemCount],
  );
  const cardHeight =
    measuredList?.itemCount === measuredItemCount
      ? measuredList.height
      : providerItems.length * PROVIDER_ROW_ESTIMATED_HEIGHT +
        providerSections.length * PROVIDER_SECTION_HEADER_ESTIMATED_HEIGHT;
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
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('settings.provider.catalog.title'),
        icon: PlusIcon,
        key: 'open-provider-catalog',
        onPress: openProviderCatalog,
        type: 'icon',
      },
    ],
    [openProviderCatalog, t],
  );

  return (
    <>
      <RouteHeader rightActions={rightActions} title={t('settings.pages.provider.title')} />
      <InlineSearch onChangeText={setQuery} value={query} />
      <View className="flex-1 px-4 pb-5">
        {providerItems.length > 0 ? (
          <View className="-mx-4 min-h-0 flex-1">
            <View style={{ height: cardHeight, maxHeight: '100%' }}>
              <SectionList
                alwaysBounceVertical={false}
                estimatedItemSize={PROVIDER_ROW_ESTIMATED_HEIGHT}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                keyExtractor={keyExtractor}
                ListFooterComponent={listFooter}
                maintainVisibleContentPosition={false}
                onContentSizeChange={handleContentSizeChange}
                onEndReached={loadMoreProviders}
                onEndReachedThreshold={0.7}
                recycleItems
                renderItem={renderProviderRow}
                renderSectionHeader={renderProviderSectionHeader}
                sections={providerSections}
                showsVerticalScrollIndicator={false}
                stickySectionHeadersEnabled={false}
                style={styles.list}
              />
            </View>
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
  list: {
    flex: 1,
  },
});
