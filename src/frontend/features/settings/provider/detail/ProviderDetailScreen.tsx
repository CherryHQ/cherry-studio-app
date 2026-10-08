import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import { ContentState, Section, useToast } from '@cherrystudio/ui/components';
import { Redirect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';
import { InlineSearch, useInlineSearch } from '@/frontend/components/InlineSearch';
import { ModelRegistryGate } from '@/frontend/components/ModelRegistry';
import { SelectionToolbar } from '@/frontend/components/Selection';
import { useBackendModule, useQuery } from '@/frontend/data';
import type { Model } from '@/shared/data/types/model';

import { useProviderApiServiceSheetClose } from '../apiService';
import {
  ProviderConfiguration,
  useSavedProviderConfiguration,
} from '../components/ProviderConfiguration';
import { useProviderDeletion } from '../hooks/useProviderDeletion';
import { useProviderSetup } from '../hooks/useProviderSetup';
import { ProviderModelPurposeTabs } from '../models/components/ProviderModelPurposeTabs';
import { useProviderModelManagement } from '../models/hooks/useProviderModelManagement';
import {
  filterProviderModelsByPurpose,
  getEffectiveProviderModelPurpose,
  getProviderModelPurposeCounts,
  hasMultipleProviderModelPurposes,
  type ProviderModelPurpose,
} from '../models/utils/providerModelPurpose';
import { ProviderDetailTabs } from './components/ProviderDetailTabs/ProviderDetailTabs';
import type { ProviderDetailTab } from './components/ProviderDetailTabs/types';
import { ProviderModelList } from './components/ProviderModelList';
import { useProviderDetailSettings } from './hooks/useProviderDetailSettings';

export default function ProviderDetailSettingsScreen() {
  const { providerId, providerName } = useLocalSearchParams<{
    providerId?: string;
    providerName?: string;
  }>();

  if (!providerId) {
    return <Redirect href="/settings/provider" />;
  }

  return (
    <ProviderDetailSettings key={providerId} providerId={providerId} providerName={providerName} />
  );
}

function ProviderDetailSettings({
  providerId,
  providerName,
}: {
  providerId: string;
  providerName?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { toast } = useToast();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const activeTab: ProviderDetailTab = tab === 'models' ? 'models' : 'configuration';
  const providers = useBackendModule('providers');
  const notifyRegistryUpdated = useEffectEvent(() => {
    if (navigation.isFocused()) {
      toast.show({ label: t('models.registry.updated'), variant: 'success' });
    }
  });
  useEffect(() => {
    if (activeTab !== 'models') return;
    let isActive = true;
    // Opening a model list is the only catalog refresh after the first download. Offline or
    // unchanged catalogs keep the saved snapshot, and a first download failing shows in the gate.
    void providers
      .applyRegistryUpdate()
      .then((result) => {
        if (isActive && result.status === 'updated') notifyRegistryUpdated();
      })
      .catch(() => undefined);
    return () => {
      isActive = false;
    };
  }, [activeTab, providers]);
  const { isPreparing, openSetup } = useProviderSetup();
  const [modelPurpose, setModelPurpose] = useState<ProviderModelPurpose>('all');
  const { models, modelsQuery } = useProviderDetailSettings(providerId);
  const configuration = useSavedProviderConfiguration(providerId);
  const { provider, providerQuery } = configuration;
  const allProviderModelsQuery = useQuery('/models', {
    enabled: Boolean(providerId),
    query: { providerId },
  });
  const allProviderModels = useMemo(
    () => allProviderModelsQuery.data ?? [],
    [allProviderModelsQuery.data],
  );
  const managedModels = allProviderModels;
  const supportedModelIds = useMemo(
    () => (modelsQuery.data ? new Set(models.map((model) => model.id)) : undefined),
    [models, modelsQuery.data],
  );
  const {
    isFiltering: isModelSearchActive,
    query: modelSearchText,
    results: searchedModels,
    setQuery: setModelSearchText,
  } = useInlineSearch({
    fields: (model: Model) => [model.id, model.modelId, model.name, model.group, model.description],
    items: managedModels,
  });
  const modelPurposeCounts = useMemo(
    () => getProviderModelPurposeCounts(managedModels),
    [managedModels],
  );
  const effectiveModelPurpose = getEffectiveProviderModelPurpose(modelPurpose, modelPurposeCounts);
  const listedModels = useMemo(
    () => filterProviderModelsByPurpose(searchedModels, effectiveModelPurpose),
    [effectiveModelPurpose, searchedModels],
  );
  const management = useProviderModelManagement(providerId, managedModels, listedModels);
  const isModelListFiltered = isModelSearchActive || effectiveModelPurpose !== 'all';
  const showsModelPurposeTabs = hasMultipleProviderModelPurposes(modelPurposeCounts);
  const isConfigurationBusy = configuration.value?.isBusy ?? false;
  const { allowNavigation, requestClose } = useProviderApiServiceSheetClose({
    hasUnsavedChanges: false,
    isSaving: configuration.isSaving || management.isDeleting,
  });
  const { isDeleting, requestDelete } = useProviderDeletion({ onBeforeDismiss: allowNavigation });
  const handleDelete = useCallback(() => {
    if (provider) {
      requestDelete(provider);
    }
  }, [provider, requestDelete]);
  const configuredProviderName = provider?.name;
  const startModelSync = useCallback(() => {
    void openSetup(
      providerId,
      `/settings/provider/${encodeURIComponent(providerId)}?tab=models`,
      'sync',
    );
  }, [openSetup, providerId]);

  const openModelAddSettings = useCallback(() => {
    router.push({
      params: {
        mode: 'manual',
        returnTo: `/settings/provider/${encodeURIComponent(providerId)}?tab=models`,
        ...(configuredProviderName ? { providerName: configuredProviderName } : {}),
        providerId,
      },
      pathname: '/settings/provider/[providerId]/model-add',
    });
  }, [configuredProviderName, providerId, router]);
  const modelActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('settings.provider.models.syncTitle'),
        disabled: !provider || isPreparing || isConfigurationBusy || management.isDeleting,
        icon: RefreshCwIcon,
        key: 'sync-provider-models',
        onPress: startModelSync,
        type: 'icon',
      },
      {
        accessibilityLabel: t('settings.provider.models.addTitle'),
        disabled: !provider || isPreparing || isConfigurationBusy || management.isDeleting,
        icon: PlusIcon,
        key: 'add-provider-model',
        onPress: openModelAddSettings,
        type: 'icon',
      },
    ],
    [
      isConfigurationBusy,
      isPreparing,
      management.isDeleting,
      openModelAddSettings,
      startModelSync,
      provider,
      t,
    ],
  );
  const handleTabChange = useCallback(
    (tab: ProviderDetailTab) => {
      if (isConfigurationBusy || management.isSelecting || management.isDeleting) {
        return;
      }

      setModelSearchText('');
      setModelPurpose('all');
      router.setParams({ tab });
    },
    [
      isConfigurationBusy,
      management.isDeleting,
      management.isSelecting,
      router,
      setModelSearchText,
    ],
  );
  if (providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  // Everything below renders the same tree whether or not the data has landed:
  // only the ScrollView's children swap. Branching on `isProviderDetailLoading`
  // one level higher used to reconfigure the native header (string title ->
  // `headerTitle` element) and mount the ScrollView after the push had settled.
  // On a first visit that left the scroll view with a zero top content inset, so
  // the content rendered underneath the header.
  return (
    <>
      <RouteHeader
        onBack={management.isSelecting ? management.finishSelection : requestClose}
        rightActions={
          management.isSelecting
            ? [
                {
                  type: 'label',
                  key: 'finish-selection',
                  label: t('common.done'),
                  accessibilityLabel: t('common.done'),
                  disabled: management.isDeleting,
                  onPress: management.finishSelection,
                },
              ]
            : activeTab === 'configuration'
              ? undefined
              : modelActions
        }
        title={
          // The route param is only there to name the page before the record
          // lands; once it has, it is what a rename shows up in.
          management.isSelecting
            ? t('settings.provider.models.management.selectedCount', {
                count: management.selectedIds.size,
              })
            : (provider?.name ?? providerName ?? t('settings.provider.tabs.configuration'))
        }
        titleElement={
          management.isSelecting ? undefined : (
            <ProviderDetailTabs onTabChange={handleTabChange} tab={activeTab} />
          )
        }
      />
      {activeTab === 'configuration' ? (
        <ProviderConfiguration
          footer={
            <Section>
              <Section.Item
                destructive
                disabled={isDeleting || configuration.value?.isBusy}
                label={t('settings.provider.deleteProvider')}
                onPress={handleDelete}
                showChevron={false}
              />
            </Section>
          }
          testID="provider-configuration"
          value={configuration.value}
        />
      ) : (
        <>
          {/* Search mounts with the header, not with the models: letting a finished load add the
              native search bar leaves it detached from the navigation bar. Multi-select is a
              deliberate mode change, so it still unmounts the field. */}
          {management.isSelecting ? null : (
            <InlineSearch
              onChangeText={setModelSearchText}
              placeholder={t('modelPicker.searchPlaceholder')}
              value={modelSearchText}
            />
          )}
          <ModelRegistryGate>
            {managedModels.length > 0 ? (
              <View className="px-4 py-2">
                <Text className="text-muted-foreground text-sm">
                  {t(
                    management.isSelecting
                      ? 'settings.provider.models.management.scope'
                      : 'settings.provider.models.management.listTitle',
                    { count: managedModels.length },
                  )}
                </Text>
              </View>
            ) : null}
            {management.isSelecting || managedModels.length === 0 ? null : showsModelPurposeTabs ? (
              <View className="px-4 pb-3">
                <ProviderModelPurposeTabs
                  onChange={setModelPurpose}
                  value={effectiveModelPurpose}
                />
              </View>
            ) : null}
            {allProviderModelsQuery.isError ? (
              <View className="px-6 py-10">
                <ContentState.Error
                  title={t('settings.provider.models.management.loadFailed')}
                  primaryAction={{
                    children: t('common.retry'),
                    onPress: () => void allProviderModelsQuery.refetch(),
                  }}
                />
              </View>
            ) : (
              <ProviderModelList
                management={management}
                supportedModelIds={supportedModelIds}
                groupByPurpose={effectiveModelPurpose === 'all'}
                isEndpointSelectionDisabled={management.isDeleting}
                isFiltered={isModelListFiltered}
                isLoading={allProviderModelsQuery.isPending}
                models={listedModels}
                onAddModelManually={openModelAddSettings}
                onPullModels={startModelSync}
                provider={provider}
              />
            )}
          </ModelRegistryGate>
          {management.isSelecting ? (
            <SelectionToolbar
              isDeleting={management.isDeleting}
              onDelete={() => management.requestDelete()}
              onToggleAll={management.toggleAll}
              selectedCount={management.selectedIds.size}
            />
          ) : null}
        </>
      )}
    </>
  );
}
