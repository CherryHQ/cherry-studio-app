import DownloadIcon from '@cherrystudio/app-icons/icons/download';
import { Button, ContentState, Spinner, useToast } from '@cherrystudio/ui/components';
import { SectionList } from '@legendapp/list/section-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import {
  readProviderSetupReturnTo,
  type ProviderSetupIntent,
  type ProviderSetupRouteParamsInput,
} from '@/frontend/appShell/navigation';
import { InlineSearch, useInlineSearch } from '@/frontend/components/InlineSearch';
import { queryKeys, useBackendModule, useQuery as useDataQuery } from '@/frontend/data';
import type { ProviderCatalogEntry } from '@/shared/contracts';
import type { Provider } from '@/shared/data/types/provider';

import { SettingsServiceRow } from '../../components/SettingsServiceRow';
import { ProviderAvatar } from '../components/ProviderAvatar';

const CATALOG_ROW_ESTIMATED_HEIGHT = 68;
const CUSTOM_PROVIDER_ITEM_ID = 'custom-provider' as const;

type ProviderCatalogItem =
  | { id: typeof CUSTOM_PROVIDER_ITEM_ID; type: 'custom' }
  | (Provider & { type: 'saved' })
  | (ProviderCatalogEntry & { type: 'preset' });

type ProviderCatalogSection = {
  data: ProviderCatalogItem[];
  title: string;
};

type ProviderCatalogRowProps = {
  entry: ProviderCatalogEntry;
  importPending: boolean;
  isPendingEntry: boolean;
  onImport: (entry: ProviderCatalogEntry) => void;
  onChoose?: (entry: ProviderCatalogEntry) => void;
};

const keyExtractor = (item: ProviderCatalogItem) => item.id;

const renderProviderSectionHeader = ({ section }: { section: ProviderCatalogSection }) => (
  <View className="h-12 justify-end px-4 pb-2">
    <Text className="font-medium text-foreground-tertiary text-sm">{section.title}</Text>
  </View>
);

function ProviderCatalogRow({
  entry,
  importPending,
  isPendingEntry,
  onImport,
  onChoose,
}: ProviderCatalogRowProps) {
  const { t } = useTranslation();

  return (
    <SettingsServiceRow
      avatar={
        <ProviderAvatar
          presetProviderId={entry.id}
          providerId={entry.id}
          providerName={entry.name}
        />
      }
      id={entry.id}
      disabled={onChoose ? importPending : undefined}
      name={entry.name}
      onPress={onChoose ? () => onChoose(entry) : undefined}
      statusLabel={entry.isInstalled ? t('settings.provider.catalog.installed') : undefined}
      statusTone="success"
      subtitle={onChoose ? entry.description : entry.id}
      trailingAction={
        onChoose ? (
          isPendingEntry ? (
            <Spinner />
          ) : undefined
        ) : entry.isInstalled ? undefined : (
          <Button
            disabled={importPending}
            loading={isPendingEntry}
            onPress={() => onImport(entry)}
            size="xs"
            variant="secondary"
          >
            {t(
              isPendingEntry
                ? 'settings.provider.catalog.importing'
                : 'settings.provider.catalog.import',
            )}
          </Button>
        )
      }
    />
  );
}

function CustomProviderCatalogRow({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();
  const name = t('settings.provider.catalog.custom');

  return (
    <SettingsServiceRow
      avatar={<ProviderAvatar providerId={CUSTOM_PROVIDER_ITEM_ID} providerName={name} />}
      id={CUSTOM_PROVIDER_ITEM_ID}
      name={name}
      subtitle={t('settings.provider.catalog.customDescription')}
      trailingAction={
        <Button onPress={onCreate} size="xs" variant="secondary">
          {t('settings.provider.catalog.create')}
        </Button>
      }
    />
  );
}

function ProviderRegistryUpdateNotice({
  isUpdating,
  onUpdate,
}: {
  isUpdating: boolean;
  onUpdate: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="gap-3 rounded-xl border border-border bg-secondary p-3">
      <View className="gap-1">
        <Text className="font-medium text-base text-foreground">
          {t('settings.provider.catalog.registryUpdate.availableTitle')}
        </Text>
        <Text className="text-foreground-secondary text-sm">
          {t('settings.provider.catalog.registryUpdate.availableDescription')}
        </Text>
      </View>
      <Button
        icon={<DownloadIcon className="size-4" />}
        loading={isUpdating}
        onPress={onUpdate}
        size="sm"
      >
        {t(
          isUpdating
            ? 'settings.provider.catalog.registryUpdate.updating'
            : 'settings.provider.catalog.registryUpdate.update',
        )}
      </Button>
    </View>
  );
}

export default function ProviderCatalogScreen({
  setupIntent,
}: { setupIntent?: ProviderSetupIntent } = {}) {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<ProviderSetupRouteParamsInput>();
  // Only the dedicated onboarding route opts into first-use setup, never URL parameters.
  const intent = setupIntent;
  const returnTo = readProviderSetupReturnTo(params.returnTo) ?? '/settings/provider';
  const [showsAllProviders, setShowsAllProviders] = useState(false);
  const isFocusedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      return () => {
        isFocusedRef.current = false;
      };
    }, []),
  );
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const providers = useBackendModule('providers');
  const savedProviders = useDataQuery('/providers', { enabled: intent === 'chat' });
  const catalogQuery = useQuery({
    queryFn: providers.listCatalog,
    queryKey: queryKeys.providers.catalog(),
    staleTime: 5 * 60 * 1000,
  });
  const registryUpdateQueryKey = queryKeys.providers.registryUpdate();
  const registryUpdateQuery = useQuery({
    enabled: false,
    queryFn: providers.checkRegistryUpdate,
    queryKey: registryUpdateQueryKey,
    retry: false,
  });
  const refetchRegistryUpdate = registryUpdateQuery.refetch;
  useFocusEffect(
    useCallback(() => {
      if (intent !== 'chat') void refetchRegistryUpdate();
    }, [intent, refetchRegistryUpdate]),
  );
  const applyRegistryUpdateMutation = useMutation({
    mutationFn: providers.applyRegistryUpdate,
    onError: () => {
      toast.show({
        label: t('settings.provider.catalog.registryUpdate.updateFailed'),
        variant: 'danger',
      });
    },
    onSuccess: (result) => {
      queryClient.setQueryData(registryUpdateQueryKey, { status: 'current' });
      toast.show({
        label: t(
          result.status === 'updated'
            ? 'settings.provider.catalog.registryUpdate.updated'
            : 'settings.provider.catalog.registryUpdate.current',
        ),
        variant: 'success',
      });
    },
  });
  const entries = catalogQuery.data ?? [];
  const {
    query,
    results: listedEntries,
    setQuery,
  } = useInlineSearch({
    fields: (entry: ProviderCatalogEntry) => [entry.name, entry.id, entry.description],
    items: entries,
  });

  const openProviderSetup = useCallback(
    (provider: Pick<ProviderCatalogEntry, 'id' | 'name'>) => {
      const href = {
        pathname:
          intent === 'chat'
            ? ('/onboarding/connection' as const)
            : ('/settings/provider/new' as const),
        params: {
          providerId: provider.id,
          providerName: provider.name,
          returnTo,
        },
      };
      if (intent === 'chat') router.push(href);
      else router.replace(href);
    },
    [intent, returnTo, router],
  );
  const openCustomProvider = useCallback(() => {
    if (intent === 'chat')
      router.push({ pathname: '/onboarding/connection', params: { returnTo } });
    else router.replace({ pathname: '/settings/provider/new', params: { returnTo } });
  }, [intent, returnTo, router]);
  const importMutation = useMutation({
    mutationFn: providers.importPreset,
    onError: () => {
      toast.show({ label: t('settings.provider.catalog.importFailed'), variant: 'danger' });
    },
    onSuccess: async (provider) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.providers.catalog() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.providers.list() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.providers.page() }),
      ]);
      if (isFocusedRef.current) openProviderSetup(provider);
    },
  });
  const importProvider = importMutation.mutate;
  const importPending = importMutation.isPending;
  const pendingProviderId = importPending ? importMutation.variables : undefined;
  const handleImportProvider = useCallback(
    (entry: ProviderCatalogEntry) => {
      if (importPending) {
        return;
      }
      if (entry.isInstalled) {
        if (intent === 'chat') openProviderSetup(entry);
        return;
      }

      importProvider(entry.id);
    },
    [importPending, importProvider, intent, openProviderSetup],
  );
  const sections = useMemo<ProviderCatalogSection[]>(() => {
    const recommended: ProviderCatalogItem[] = [
      ...(intent === 'chat' ? [] : [{ id: CUSTOM_PROVIDER_ITEM_ID, type: 'custom' as const }]),
      ...listedEntries
        .filter((entry) => entry.isRecommended)
        .map((entry) => ({ ...entry, type: 'preset' as const })),
    ];
    const all: ProviderCatalogItem[] = listedEntries
      .filter((entry) => !entry.isRecommended)
      .map((entry) => ({ ...entry, type: 'preset' as const }));

    return [
      {
        data:
          intent === 'chat'
            ? (savedProviders.data ?? [])
                .filter(
                  (provider) =>
                    !provider.presetProviderId &&
                    (!query ||
                      `${provider.name} ${provider.id}`
                        .toLowerCase()
                        .includes(query.toLowerCase())),
                )
                .map((provider) => ({ ...provider, type: 'saved' as const }))
            : [],
        title: t('onboarding.provider.saved'),
      },
      {
        data:
          intent === 'chat' && !query && !showsAllProviders ? recommended.slice(0, 6) : recommended,
        title: t('settings.provider.catalog.section.recommended'),
      },
      {
        data:
          intent !== 'chat' || query || showsAllProviders || recommended.length === 0 ? all : [],
        title: t('settings.provider.catalog.section.all'),
      },
    ].filter(({ data }) => data.length > 0);
  }, [intent, listedEntries, query, savedProviders.data, showsAllProviders, t]);
  const renderProviderRow = useCallback(
    ({ item }: { item: ProviderCatalogItem }) =>
      item.type === 'custom' ? (
        <CustomProviderCatalogRow onCreate={openCustomProvider} />
      ) : item.type === 'saved' ? (
        <SettingsServiceRow
          avatar={<ProviderAvatar providerId={item.id} providerName={item.name} />}
          disabled={importPending}
          id={item.id}
          name={item.name}
          onPress={() => openProviderSetup(item)}
          subtitle={t('onboarding.provider.continue')}
        />
      ) : (
        <ProviderCatalogRow
          entry={item}
          importPending={importPending}
          isPendingEntry={pendingProviderId === item.id}
          onImport={handleImportProvider}
          onChoose={intent === 'chat' ? handleImportProvider : undefined}
        />
      ),
    [
      handleImportProvider,
      importPending,
      intent,
      openCustomProvider,
      openProviderSetup,
      pendingProviderId,
      t,
    ],
  );
  const retry = useCallback(() => {
    void catalogQuery.refetch();
    if (intent === 'chat') void savedProviders.refetch();
  }, [catalogQuery, intent, savedProviders]);

  return (
    <>
      <RouteHeader
        title={t(
          intent === 'chat' ? 'onboarding.provider.title' : 'settings.provider.catalog.title',
        )}
      />
      <InlineSearch onChangeText={setQuery} value={query} />
      {intent === 'chat' ? (
        <View className="gap-2 px-4 pt-4 pb-2">
          <Text className="text-xs text-muted-foreground">
            {t('onboarding.step', { current: 1 })}
          </Text>
          <Text className="text-base text-foreground">{t('onboarding.provider.description')}</Text>
        </View>
      ) : null}
      <View className="min-h-0 flex-1 gap-3 px-4 pb-5">
        {intent !== 'chat' && registryUpdateQuery.data?.status === 'available' ? (
          <ProviderRegistryUpdateNotice
            isUpdating={applyRegistryUpdateMutation.isPending}
            onUpdate={() => applyRegistryUpdateMutation.mutate()}
          />
        ) : null}
        {catalogQuery.isPending || (intent === 'chat' && savedProviders.isPending) ? (
          <View className="px-1 py-8">
            <ContentState.Loading title={t('settings.provider.catalog.loading')} />
          </View>
        ) : catalogQuery.isError || (intent === 'chat' && savedProviders.isError) ? (
          <View className="px-1 py-8">
            <ContentState.Error
              primaryAction={{ children: t('common.retry'), onPress: retry }}
              title={t('settings.provider.catalog.loadFailed')}
            />
          </View>
        ) : (
          <View className="-mx-4 min-h-0 flex-1">
            <SectionList
              contentInsetAdjustmentBehavior="automatic"
              estimatedItemSize={CATALOG_ROW_ESTIMATED_HEIGHT}
              extraData={pendingProviderId}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              keyExtractor={keyExtractor}
              ListEmptyComponent={
                <View className="px-4 py-8">
                  <ContentState.Empty title={t('onboarding.provider.noResults')} />
                </View>
              }
              ListFooterComponent={
                intent === 'chat' ? (
                  <View className="gap-3 px-4 py-5">
                    {!query && !showsAllProviders ? (
                      <Button variant="ghost" onPress={() => setShowsAllProviders(true)}>
                        {t('onboarding.provider.showAll')}
                      </Button>
                    ) : null}
                    <Button disabled={importPending} onPress={openCustomProvider} variant="outline">
                      {t('settings.provider.catalog.custom')}
                    </Button>
                  </View>
                ) : null
              }
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
