import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import { ContentState, useAlert } from '@cherrystudio/ui/components';
import { SectionList } from '@legendapp/list/section-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import { InlineSearch, useInlineSearch } from '@/frontend/components/inlineSearch';
import { queryKeys, useBackendModule } from '@/frontend/data';
import type { ProviderCatalogEntry } from '@/shared/contracts';

import { ProviderAvatar } from '../components/ProviderAvatar';
import { SettingsServiceRow } from '../components/SettingsServiceRow';

const CATALOG_ROW_ESTIMATED_HEIGHT = 68;

type ProviderCatalogSection = {
  data: ProviderCatalogEntry[];
  title: string;
};

type ProviderCatalogRowProps = {
  entry: ProviderCatalogEntry;
  importPending: boolean;
  isPendingEntry: boolean;
  onPress: (entry: ProviderCatalogEntry) => void;
};

const keyExtractor = (item: ProviderCatalogEntry) => item.id;

const renderProviderSectionHeader = ({ section }: { section: ProviderCatalogSection }) => (
  <View className="h-12 justify-end px-4 pb-2">
    <Text className="font-medium text-foreground-tertiary text-sm">{section.title}</Text>
  </View>
);

function ProviderCatalogRow({
  entry,
  importPending,
  isPendingEntry,
  onPress,
}: ProviderCatalogRowProps) {
  const { t } = useTranslation();
  const statusLabel = entry.isInstalled
    ? t('settings.provider.catalog.installed')
    : isPendingEntry
      ? t('settings.provider.catalog.importing')
      : t('settings.provider.catalog.import');

  return (
    <SettingsServiceRow
      avatar={
        <ProviderAvatar
          presetProviderId={entry.id}
          providerId={entry.id}
          providerName={entry.name}
        />
      }
      disabled={importPending}
      id={entry.id}
      name={entry.name}
      onPress={() => onPress(entry)}
      statusLabel={statusLabel}
      statusTone={entry.isInstalled ? 'success' : 'default'}
      subtitle={entry.id}
    />
  );
}

export default function ProviderCatalogScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { alert } = useAlert();
  const providers = useBackendModule('providers');
  const catalogQuery = useQuery({
    queryFn: providers.listCatalog,
    queryKey: queryKeys.providers.catalog(),
    staleTime: 5 * 60 * 1000,
  });
  const entries = catalogQuery.data ?? [];
  const {
    isFiltering,
    query,
    results: listedEntries,
    setQuery,
  } = useInlineSearch({
    fields: (entry: ProviderCatalogEntry) => [entry.name, entry.id, entry.description],
    items: entries,
  });

  const openProvider = useCallback(
    (provider: Pick<ProviderCatalogEntry, 'id' | 'name'>) => {
      router.push({
        pathname: '/settings/provider/[providerId]',
        params: { providerId: provider.id, providerName: provider.name },
      });
    },
    [router],
  );
  const importMutation = useMutation({
    mutationFn: providers.importPreset,
    onError: () => {
      alert.show({ title: t('settings.provider.catalog.importFailed') });
    },
    onSuccess: async (provider) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.providers.catalog() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.providers.list() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.providers.page() }),
      ]);
      openProvider(provider);
    },
  });
  const importProvider = importMutation.mutate;
  const importPending = importMutation.isPending;
  const pendingProviderId = importPending ? importMutation.variables : undefined;
  const handleProviderPress = useCallback(
    (entry: ProviderCatalogEntry) => {
      if (importPending) {
        return;
      }

      if (entry.isInstalled) {
        openProvider(entry);
        return;
      }

      importProvider(entry.id);
    },
    [importPending, importProvider, openProvider],
  );
  const sections = useMemo<ProviderCatalogSection[]>(() => {
    const recommended = listedEntries.filter((entry) => entry.isRecommended);
    const all = listedEntries.filter((entry) => !entry.isRecommended);

    return [
      {
        data: recommended,
        title: t('settings.provider.catalog.section.recommended'),
      },
      { data: all, title: t('settings.provider.catalog.section.all') },
    ].filter(({ data }) => data.length > 0);
  }, [listedEntries, t]);
  const renderProviderRow = useCallback(
    ({ item }: { item: ProviderCatalogEntry }) => (
      <ProviderCatalogRow
        entry={item}
        importPending={importPending}
        isPendingEntry={pendingProviderId === item.id}
        onPress={handleProviderPress}
      />
    ),
    [handleProviderPress, importPending, pendingProviderId],
  );
  const openCustomProvider = useCallback(() => {
    router.push('/settings/provider/new');
  }, [router]);
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('settings.provider.catalog.custom'),
        icon: PlusIcon,
        key: 'create-custom-provider',
        onPress: openCustomProvider,
        type: 'icon',
      },
    ],
    [openCustomProvider, t],
  );
  const retry = useCallback(() => {
    void catalogQuery.refetch();
  }, [catalogQuery]);

  return (
    <>
      <RouteHeader rightActions={rightActions} title={t('settings.provider.catalog.title')} />
      <InlineSearch onChangeText={setQuery} value={query} />
      <View className="min-h-0 flex-1 px-4 pb-5">
        {catalogQuery.isPending ? (
          <ContentState.Loading
            className="px-1 py-8"
            title={t('settings.provider.catalog.loading')}
          />
        ) : catalogQuery.isError ? (
          <ContentState.Error
            className="px-1 py-8"
            description={
              catalogQuery.error instanceof Error
                ? catalogQuery.error.message
                : String(catalogQuery.error)
            }
            primaryAction={{ children: t('common.retry'), onPress: retry }}
            title={t('settings.provider.catalog.loadFailed')}
          />
        ) : listedEntries.length === 0 ? (
          <ContentState.Empty
            className="px-6 py-8"
            title={t(
              isFiltering
                ? 'settings.provider.catalog.searchEmpty'
                : 'settings.provider.catalog.empty',
            )}
          />
        ) : (
          <View className="-mx-4 min-h-0 flex-1">
            <SectionList
              contentInsetAdjustmentBehavior="automatic"
              estimatedItemSize={CATALOG_ROW_ESTIMATED_HEIGHT}
              extraData={pendingProviderId}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              keyExtractor={keyExtractor}
              maintainVisibleContentPosition={false}
              recycleItems
              renderItem={renderProviderRow}
              renderSectionHeader={renderProviderSectionHeader}
              sections={sections}
              showsVerticalScrollIndicator={false}
              stickySectionHeadersEnabled={false}
              style={styles.list}
            />
          </View>
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
