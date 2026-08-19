import { EllipsisIcon, SettingsIcon } from '@cherrystudio/app-icons';
import { type MenuItem, Spinner, useAlert } from '@cherrystudio/ui/components';
import { Color, Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BackHeader, type HeaderToolbarAction } from '@/frontend/components/headers';

import {
  buildApiKeyEntriesFromInput,
  buildApiKeysInputFromEntries,
  buildProviderPrimaryBaseUrlUpdates,
  canEditProviderEndpoint,
  getEffectiveAuthConfig,
  getProviderPrimaryBaseUrl,
  normalizeApiKeyEntries,
  ProviderApiServiceApiKeysField,
  ProviderApiServiceEndpointField,
  ProviderApiServiceSaveError,
  shouldShowApiKeys,
  useProviderApiServiceQueries,
} from './apiService';
import { ProviderModelList } from './components/ProviderModelList';
import { useProviderDetailSettings } from './detail';
import { ProviderDetailBanner } from './detail/components/ProviderDetailBanner';
import { ProviderDetailChrome } from './detail/components/ProviderDetailChrome/ProviderDetailChrome';
import { ProviderDetailTabs } from './detail/components/ProviderDetailTabs/ProviderDetailTabs';
import type { ProviderDetailTab } from './detail/components/ProviderDetailTabs/types';
import { ProviderModelCheckSection } from './models/components/ProviderModelCheckSection';
import { useProviderModelPull } from './models/hooks/useProviderModelPull';
import { useProviderModelRemove } from './models/hooks/useProviderModelRemove';
import { useProviderModelSelection } from './models/hooks/useProviderModelSelection';
import { stashProviderModelPullPreview } from './models/utils/providerModelPullPreviewStore';

export default function ProviderDetailSettingsScreen() {
  const { providerId, providerName } = useLocalSearchParams<{
    providerId?: string;
    providerName?: string;
  }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const [activeTab, setActiveTab] = useState<ProviderDetailTab>('configuration');
  const { models, modelsQuery, provider, providerQuery, updateProviderEnabledMutation } =
    useProviderDetailSettings(providerId ?? '');
  const { isDefaultModel, removeModels } = useProviderModelRemove();
  const modelSelection = useProviderModelSelection();
  const {
    apiKeys,
    apiKeysQuery,
    authConfig,
    authConfigQuery,
    replaceApiKeysMutation,
    saveProviderMutation,
  } = useProviderApiServiceQueries(providerId ?? '');
  const { isPreviewLoading: isModelPullLoading, loadPullPreview } = useProviderModelPull({
    onPreviewReady: (preview) => {
      if (!providerId) {
        return;
      }

      stashProviderModelPullPreview(providerId, preview);
    },
    providerId: providerId ?? '',
  });
  const canEditEndpoint = canEditProviderEndpoint(provider);
  const showApiKeys = shouldShowApiKeys(
    getEffectiveAuthConfig(authConfig, provider).type,
    provider,
  );
  const apiKeysInput = useMemo(
    () => buildApiKeysInputFromEntries(normalizeApiKeyEntries(apiKeys ?? [])),
    [apiKeys],
  );
  // Gate on all three so the content reaches its final structure on the first frame.
  // Inserting the Base URL / API keys blocks a commit later shifts the model toolbar
  // under a finger that already aimed at it.
  const isProviderDetailLoading =
    providerQuery.isPending || apiKeysQuery.isPending || authConfigQuery.isPending;
  const openProviderSettings = useCallback(() => {
    if (!providerId) {
      return;
    }

    router.push({
      params: { providerId },
      pathname: '/settings/provider/[providerId]/edit',
    });
  }, [providerId, router]);
  const commitApiKeys = useCallback(
    (input: string) => {
      const nextApiKeys = buildApiKeyEntriesFromInput(input, apiKeys ?? []);

      void replaceApiKeysMutation.mutateAsync(nextApiKeys).catch(() => {
        alert.show({ title: t('settings.provider.apiService.saveFailed') });
      });
    },
    [alert, apiKeys, replaceApiKeysMutation, t],
  );
  const commitBaseUrl = useCallback(
    async (baseUrl: string): Promise<boolean> => {
      if (!provider) {
        return false;
      }

      try {
        const updates = buildProviderPrimaryBaseUrlUpdates({ baseUrl, provider });
        if (
          updates.endpointConfigs[updates.defaultChatEndpoint]?.baseUrl ===
          getProviderPrimaryBaseUrl(provider).trim()
        ) {
          return true;
        }

        await saveProviderMutation.mutateAsync(updates);
        return true;
      } catch (error) {
        if (error instanceof ProviderApiServiceSaveError) {
          alert.show({
            description: t('settings.provider.apiService.invalidBaseUrlMessage'),
            title: t('settings.provider.apiService.invalidBaseUrlTitle'),
          });
        } else {
          alert.show({ title: t('settings.provider.apiService.saveFailed') });
        }

        return false;
      }
    },
    [alert, provider, saveProviderMutation, t],
  );
  const openModelAddSettings = useCallback(() => {
    if (!providerId) {
      return;
    }

    router.push({
      params: {
        ...(provider?.name ? { providerName: provider.name } : {}),
        providerId,
      },
      pathname: '/settings/provider/[providerId]/model-add',
    });
  }, [provider, providerId, router]);
  const openModelPullSettings = useCallback(async () => {
    if (!providerId) {
      return;
    }

    const result = await loadPullPreview();
    if (result !== 'ready') {
      return;
    }

    router.push({
      params: {
        ...(provider?.name ? { providerName: provider.name } : {}),
        providerId,
      },
      pathname: '/settings/provider/[providerId]/model-pull',
    });
  }, [loadPullPreview, provider, providerId, router]);
  // The provider's own settings — logo, name, endpoints — rather than the keys
  // and models this page already shows inline.
  const configurationActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('settings.provider.edit.title'),
        androidIcon: SettingsIcon,
        disabled: !provider,
        icon: 'gearshape',
        key: 'provider-settings',
        onPress: openProviderSettings,
      },
    ],
    [openProviderSettings, provider, t],
  );
  const addAction = useMemo(
    () => ({ isDisabled: !provider, onPress: openModelAddSettings }),
    [openModelAddSettings, provider],
  );
  const modelPullAction = useMemo(
    () => ({
      isDisabled: !provider || isModelPullLoading,
      isLoading: isModelPullLoading,
      onPress: () => void openModelPullSettings(),
    }),
    [isModelPullLoading, openModelPullSettings, provider],
  );
  // The chat default is the one model the service refuses to delete, so it is
  // also the one row a selection leaves alone — including "select all".
  const selectableIds = useMemo(
    () => models.filter((model) => !isDefaultModel(model)).map((model) => model.id),
    [isDefaultModel, models],
  );
  const modelMenuItems = useMemo<readonly MenuItem[]>(
    () => [
      {
        disabled: !provider,
        id: 'add-model',
        label: t('settings.provider.models.addTitle'),
        onPress: openModelAddSettings,
        systemImage: 'plus',
      },
      {
        disabled: !provider || isModelPullLoading,
        id: 'pull-models',
        label: t('settings.provider.models.pullPreviewTitle'),
        onPress: () => void openModelPullSettings(),
        systemImage: 'arrow.trianglehead.2.clockwise.rotate.90',
      },
      {
        disabled: selectableIds.length === 0,
        id: 'select-models',
        label: t('settings.provider.models.selection.start'),
        onPress: modelSelection.enterEditing,
        systemImage: 'checklist',
      },
    ],
    [
      isModelPullLoading,
      modelSelection.enterEditing,
      openModelAddSettings,
      openModelPullSettings,
      provider,
      selectableIds.length,
      t,
    ],
  );
  const modelActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.more'),
        androidIcon: EllipsisIcon,
        disabled: !provider,
        icon: 'ellipsis',
        key: 'model-actions',
        menuItems: modelMenuItems,
      },
    ],
    [modelMenuItems, provider, t],
  );
  const { exitEditing: exitModelSelection, selectedIds: selectedModelIds } = modelSelection;
  const selectedModels = useMemo(
    () => models.filter((model) => selectedModelIds.has(model.id) && !isDefaultModel(model)),
    [isDefaultModel, models, selectedModelIds],
  );
  const modelListSelection = useMemo(
    () =>
      modelSelection.isEditing
        ? { onToggleModel: modelSelection.toggleModel, selectedIds: selectedModelIds }
        : undefined,
    [modelSelection.isEditing, modelSelection.toggleModel, selectedModelIds],
  );
  const handleTabChange = useCallback(
    (tab: ProviderDetailTab) => {
      exitModelSelection();
      setActiveTab(tab);
    },
    [exitModelSelection],
  );
  const requestRemoveSelectedModels = useCallback(() => {
    if (selectedModels.length === 0) {
      return;
    }

    alert.confirm({
      confirmLabel: t('common.delete'),
      description: t('settings.provider.models.selection.removeMessage', {
        count: selectedModels.length,
      }),
      onConfirm: () => {
        // Left before the request so the rows stop being checkboxes at the tap,
        // rather than after a round trip that also empties the list under them.
        exitModelSelection();
        void removeModels(selectedModels);
      },
      role: 'destructive',
      title: t('settings.provider.models.selection.removeTitle'),
    });
  }, [alert, exitModelSelection, removeModels, selectedModels, t]);
  const selectionHeaderLeftActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.done'),
        key: 'finish-selecting-models',
        label: t('common.done'),
        onPress: exitModelSelection,
      },
    ],
    [exitModelSelection, t],
  );
  const selectionHeaderRightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.delete'),
        disabled: selectedModels.length === 0,
        key: 'remove-selected-models',
        label: t('common.delete'),
        onPress: requestRemoveSelectedModels,
        tintColor: Color.ios.systemRed,
      },
    ],
    [requestRemoveSelectedModels, selectedModels.length, t],
  );
  const handleToggleProvider = useCallback(() => {
    if (!provider) {
      return;
    }

    updateProviderEnabledMutation.mutate(!provider.isEnabled);
  }, [provider, updateProviderEnabledMutation]);

  if (!providerId || providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  // Everything below renders the same tree whether or not the data has landed:
  // only the ScrollView's children swap. Branching on `isProviderDetailLoading`
  // one level higher used to reconfigure the native header (string title ->
  // `headerTitle` element), mount the ScrollView, and install the bottom
  // `Stack.Toolbar` *after* the push had settled — which on a first visit (nothing
  // in the query cache) left the scroll view with a zero top content inset, so the
  // content rendered underneath the header. A second visit read from cache, took
  // this exact tree on the first frame, and looked fine.
  return (
    <>
      {/* Selecting takes the header over: the tabs would navigate out from under
          the selection, and "Done" belongs where the back button was. */}
      <BackHeader
        leftActions={modelSelection.isEditing ? selectionHeaderLeftActions : undefined}
        rightActions={
          modelSelection.isEditing
            ? selectionHeaderRightActions
            : activeTab === 'models'
              ? modelActions
              : configurationActions
        }
        title={
          modelSelection.isEditing
            ? t('settings.provider.models.selection.count', { count: selectedModels.length })
            : // The route param is only there to name the page before the record
              // lands; once it has, it is what a rename shows up in.
              (provider?.name ?? providerName ?? t('settings.provider.tabs.configuration'))
        }
        titleElement={
          modelSelection.isEditing ? undefined : (
            <ProviderDetailTabs onTabChange={handleTabChange} tab={activeTab} />
          )
        }
      />
      {activeTab === 'configuration' ? (
        <>
          {/* Heads the configuration rather than the page: the header carries
              the tabs, and the models tab is a list of rows shaped like this
              one, where a provider row would read as a model. */}
          <ProviderDetailBanner
            isActive={provider?.isEnabled ?? false}
            isDisabled={!provider || updateProviderEnabledMutation.isPending}
            onToggleActive={handleToggleProvider}
            provider={provider}
            providerId={providerId}
            providerName={providerName}
          />
          <ScrollView
            alwaysBounceVertical={false}
            contentContainerStyle={styles.configurationContent}
            contentInsetAdjustmentBehavior="automatic"
            showsVerticalScrollIndicator={false}
            style={styles.screen}
          >
            {isProviderDetailLoading ? (
              <View className="items-center py-10">
                <Spinner accessibilityLabel={t('settings.provider.loading')} />
              </View>
            ) : (
              // Still gated as one commit: #467 kept the Base URL / API keys blocks
              // out until all three queries land so the content never grows under a
              // finger that already aimed at the toolbar.
              <>
                <View className="gap-3">
                  {canEditEndpoint ? (
                    <ProviderApiServiceEndpointField
                      baseUrl={getProviderPrimaryBaseUrl(provider)}
                      onCommit={commitBaseUrl}
                    />
                  ) : null}
                  {showApiKeys ? (
                    <ProviderApiServiceApiKeysField
                      apiKeysInput={apiKeysInput}
                      onCommit={commitApiKeys}
                    />
                  ) : null}
                </View>
                <ProviderModelCheckSection
                  apiKeys={apiKeys}
                  isLoading={modelsQuery.isPending}
                  models={models}
                  provider={provider}
                  providerId={providerId}
                />
              </>
            )}
          </ScrollView>
        </>
      ) : (
        <ProviderModelList
          addAction={addAction}
          isDefaultModel={isDefaultModel}
          isLoading={modelsQuery.isPending}
          models={models}
          provider={provider}
          pullAction={modelPullAction}
          selection={modelListSelection}
        />
      )}
      {/* Mounted from the first frame — installing a bottom toolbar later is a
          native nav-item change, which is what the loading branch used to do. */}
      <ProviderDetailChrome
        selection={
          modelSelection.isEditing
            ? {
                isAllSelected:
                  selectableIds.length > 0 && selectableIds.every((id) => selectedModelIds.has(id)),
                onToggleAll: () => modelSelection.toggleAll(selectableIds),
              }
            : undefined
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  configurationContent: {
    gap: 20,
    paddingBottom: 96,
    paddingHorizontal: 16,
    // No top padding: the banner above already carries the gap, and doubling it
    // would set the first field further from the banner than the fields are
    // from each other.
    paddingTop: 0,
  },
  screen: {
    flex: 1,
  },
});
