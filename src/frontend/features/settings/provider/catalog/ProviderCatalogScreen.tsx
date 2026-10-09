import { Button, ContentState, Section, Spinner, useToast } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { SectionList } from '@legendapp/list/section-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import {
  readProviderSetupReturnTo,
  type FirstUseSetupIntent,
  type ProviderSetupRouteParamsInput,
} from '@/frontend/appShell/navigation';
import { ProviderAvatar } from '@/frontend/components/Avatar';
import { InlineSearch, useInlineSearch } from '@/frontend/components/InlineSearch';
import { queryKeys, useBackendModule, useQuery as useDataQuery } from '@/frontend/data';
import type { ProviderCatalogEntry } from '@/shared/contracts';
import type { Provider } from '@/shared/data/types/provider';

import { SettingsGroupedSeparator, SettingsServiceRow } from '../../components/SettingsServiceRow';
import { ProviderAccountBadge } from '../components/ProviderAccountBadge';

const CATALOG_ROW_ESTIMATED_HEIGHT = 56;
const CUSTOM_PROVIDER_ITEM_ID = 'custom-provider' as const;

type ProviderCatalogEntryItem =
  | { id: typeof CUSTOM_PROVIDER_ITEM_ID; type: 'custom' }
  | (Provider & { type: 'saved' })
  | (ProviderCatalogEntry & { type: 'preset' });

/** Position within its section, so each row can draw its slice of the section's card. */
type ProviderCatalogItem = ProviderCatalogEntryItem & { isFirst: boolean; isLast: boolean };

type ProviderCatalogSection = {
  data: ProviderCatalogItem[];
  isFirst: boolean;
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

// Mirrors a titled `Section`: the title sits 12pt inside the card edge, 4pt above it.
const renderProviderSectionHeader = ({ section }: { section: ProviderCatalogSection }) => (
  <View className={cn('px-7 pb-1', section.isFirst ? 'pt-2' : 'pt-6')}>
    <Section.Header accessibilityRole="header" title={section.title} />
  </View>
);

function CatalogCardSlice({ children, item }: { children: ReactNode; item: ProviderCatalogItem }) {
  return (
    <View
      className={cn(
        'mx-4 overflow-hidden bg-card',
        item.isFirst && 'rounded-t-2xl',
        item.isLast && 'rounded-b-2xl',
      )}
      style={styles.cardSlice}
    >
      {item.isFirst ? null : <SettingsGroupedSeparator />}
      {children}
    </View>
  );
}

function ProviderCatalogRow({
  entry,
  importPending,
  isPendingEntry,
  onImport,
  onChoose,
}: ProviderCatalogRowProps) {
  const { t } = useTranslation();
  const accounts = useBackendModule('providers').accounts;
  const supportsSignIn = accounts.getCapabilities(entry).signIn;
  const onPress = onChoose ?? (entry.isInstalled ? onImport : undefined);
  const statusLabel = entry.isEnabled ? t('settings.provider.status.enabled') : undefined;
  const subtitle = onChoose ? entry.description : undefined;

  return (
    <SettingsServiceRow
      accessibilityLabel={
        supportsSignIn
          ? [entry.name, statusLabel, subtitle, t('settings.provider.account.signInSupported')]
              .filter(Boolean)
              .join(', ')
          : undefined
      }
      avatar={
        <ProviderAvatar
          presetProviderId={entry.id}
          providerId={entry.id}
          providerName={entry.name}
        />
      }
      id={entry.id}
      disabled={onPress ? importPending : undefined}
      name={entry.name}
      nameAccessory={supportsSignIn ? <ProviderAccountBadge /> : undefined}
      onPress={onPress ? () => onPress(entry) : undefined}
      statusLabel={statusLabel}
      statusTone="success"
      subtitle={subtitle}
      testID={`provider-catalog-entry-${entry.id}`}
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
      testID="provider-catalog-entry-custom"
      trailingAction={
        <Button onPress={onCreate} size="xs" testID="provider-catalog-custom" variant="secondary">
          {t('settings.provider.catalog.create')}
        </Button>
      }
    />
  );
}

export default function ProviderCatalogScreen({
  setupIntent,
}: { setupIntent?: FirstUseSetupIntent } = {}) {
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
  const accounts = providers.accounts;
  const savedProviders = useDataQuery('/providers', { enabled: intent === 'chat' });
  const catalogQuery = useQuery({
    queryFn: providers.listCatalog,
    queryKey: queryKeys.providers.catalog(),
    staleTime: 0,
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
        openProviderSetup(entry);
        return;
      }

      importProvider(entry.id);
    },
    [importPending, importProvider, openProviderSetup],
  );
  const sections = useMemo<ProviderCatalogSection[]>(() => {
    const recommended: ProviderCatalogEntryItem[] = [
      ...(intent === 'chat' ? [] : [{ id: CUSTOM_PROVIDER_ITEM_ID, type: 'custom' as const }]),
      ...listedEntries
        .filter((entry) => entry.isRecommended)
        .map((entry) => ({ ...entry, type: 'preset' as const })),
    ];
    const all: ProviderCatalogEntryItem[] = listedEntries
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
    ]
      .filter(({ data }) => data.length > 0)
      .map((section, sectionIndex) => ({
        isFirst: sectionIndex === 0,
        title: section.title,
        data: section.data.map((item, index) => ({
          ...item,
          isFirst: index === 0,
          isLast: index === section.data.length - 1,
        })),
      }));
  }, [intent, listedEntries, query, savedProviders.data, showsAllProviders, t]);
  const renderProviderRow = useCallback(
    ({ item }: { item: ProviderCatalogItem }) => {
      const supportsSavedSignIn = item.type === 'saved' && accounts.getCapabilities(item).signIn;
      return (
        <CatalogCardSlice item={item}>
          {item.type === 'custom' ? (
            <CustomProviderCatalogRow onCreate={openCustomProvider} />
          ) : item.type === 'saved' ? (
            <SettingsServiceRow
              accessibilityLabel={
                supportsSavedSignIn
                  ? [
                      item.name,
                      t('onboarding.provider.continue'),
                      t('settings.provider.account.signInSupported'),
                    ].join(', ')
                  : undefined
              }
              avatar={<ProviderAvatar providerId={item.id} providerName={item.name} />}
              disabled={importPending}
              id={item.id}
              name={item.name}
              nameAccessory={supportsSavedSignIn ? <ProviderAccountBadge /> : undefined}
              onPress={() => openProviderSetup(item)}
              subtitle={t('onboarding.provider.continue')}
              testID={`provider-catalog-entry-${item.id}`}
            />
          ) : (
            <ProviderCatalogRow
              entry={item}
              importPending={importPending}
              isPendingEntry={pendingProviderId === item.id}
              onImport={handleImportProvider}
              onChoose={intent === 'chat' ? handleImportProvider : undefined}
            />
          )}
        </CatalogCardSlice>
      );
    },
    [
      accounts,
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
      <View
        className="min-h-0 flex-1 gap-3 px-4 pb-5"
        testID={intent === 'chat' ? 'onboarding-provider' : 'provider-catalog'}
      >
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
                      <Button
                        onPress={() => setShowsAllProviders(true)}
                        testID="onboarding-provider-show-all"
                        variant="ghost"
                      >
                        {t('onboarding.provider.showAll')}
                      </Button>
                    ) : null}
                    <Button
                      disabled={importPending}
                      onPress={openCustomProvider}
                      testID="onboarding-provider-custom"
                      variant="outline"
                    >
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
              testID={intent === 'chat' ? 'onboarding-provider-list' : 'provider-catalog-list'}
            />
          </View>
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
