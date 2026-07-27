import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Spinner } from 'heroui-native/spinner';
import { useToast } from 'heroui-native/toast';
import { PlusIcon, SquareArrowOutUpRightIcon } from 'lucide-uniwind/png';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useConfirmDialog } from '@/components/confirmDialog';
import { BackHeader, type HeaderToolbarAction } from '@/components/headers';
import { queryKeys } from '@/data/api';
import { useDataMutation } from '@/data/hooks';
import { canDeleteProvider } from '@/data/services/ProviderService';
import { openExternalUrl } from '@/utils/openExternalUrl';
import {
  buildApiKeysInputFromEntries,
  canEditProviderEndpoint,
  getEffectiveAuthConfig,
  getProviderPrimaryBaseUrl,
  normalizeApiKeyEntries,
  shouldShowApiKeys,
  useProviderApiServiceQueries,
} from './apiService';
import { ProviderApiManagementSection } from './components/ProviderApiManagementSection';
import { ProviderModelList } from './components/ProviderModelList';
import { useProviderDetailSettings } from './detail';
import { ProviderDetailChrome } from './detail/components/ProviderDetailChrome/ProviderDetailChrome';
import { ProviderDetailTabs } from './detail/components/ProviderDetailTabs/ProviderDetailTabs';
import type { ProviderDetailTab } from './detail/components/ProviderDetailTabs/types';
import { ProviderModelCheckSheet } from './models/components/ProviderModelCheckSheet';
import { useProviderModelCheck } from './models/hooks/useProviderModelCheck';
import { useProviderModelPull } from './models/hooks/useProviderModelPull';
import { stashProviderModelPullPreview } from './models/utils/providerModelPullPreviewStore';

export default function ProviderDetailSettingsScreen() {
  const { providerId, providerName } = useLocalSearchParams<{
    providerId?: string;
    providerName?: string;
  }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { confirmDialog, requestConfirm } = useConfirmDialog();
  const [apiKeysVisible, setApiKeysVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<ProviderDetailTab>('configuration');
  const { models, modelsQuery, provider, providerQuery, updateProviderEnabledMutation } =
    useProviderDetailSettings(providerId ?? '');
  const deleteProviderMutation = useDataMutation({
    invalidateQueries: [
      queryKeys.providers.list(),
      queryKeys.providers.list({ enabled: true }),
      queryKeys.providers.list({ enabled: false }),
    ],
    mutationFn: (services, id: string) => services.provider.delete(id),
  });
  const { apiKeys, apiKeysQuery, authConfig, authConfigQuery } = useProviderApiServiceQueries(
    providerId ?? '',
  );
  const {
    apiKeyOptions: checkApiKeyOptions,
    closeSheet: closeCheckSheet,
    isChecking: isModelChecking,
    isSheetOpen: isCheckSheetOpen,
    openCheckSheet,
    selectedApiKeyId: selectedCheckApiKeyId,
    selectedModelId: selectedCheckModelId,
    setSelectedApiKeyId: setSelectedCheckApiKeyId,
    setSelectedModelId: setSelectedCheckModelId,
    startCheck: startModelCheck,
  } = useProviderModelCheck({
    apiKeys,
    models,
    provider,
    providerId: providerId ?? '',
  });
  const { isPreviewLoading: isModelPullLoading, loadPullPreview } = useProviderModelPull({
    onPreviewReady: (preview) => {
      if (!providerId) {
        return;
      }

      stashProviderModelPullPreview(providerId, preview);
    },
    provider,
    providerId: providerId ?? '',
  });
  const canEditEndpoint = canEditProviderEndpoint(provider);
  const showApiKeys = shouldShowApiKeys(getEffectiveAuthConfig(authConfig, provider).type);
  const apiKeysInput = useMemo(
    () => buildApiKeysInputFromEntries(normalizeApiKeyEntries(apiKeys ?? [])),
    [apiKeys],
  );
  // Gate on all three so the content reaches its final structure on the first frame.
  // Inserting the Base URL / API keys blocks a commit later shifts the model toolbar
  // under a finger that already aimed at it.
  const isProviderDetailLoading =
    providerQuery.isPending || apiKeysQuery.isPending || authConfigQuery.isPending;
  const officialWebsite = provider?.websites?.official;
  const openOfficialWebsite = useCallback(() => {
    if (!officialWebsite) {
      return;
    }

    void openExternalUrl(officialWebsite);
  }, [officialWebsite]);
  const openEndpointSettings = useCallback(() => {
    if (!providerId) {
      return;
    }

    router.push({
      params: {
        ...(provider?.name ? { providerName: provider.name } : {}),
        providerId,
      },
      pathname: '/settings/provider/[providerId]/endpoint-settings',
    });
  }, [provider, providerId, router]);
  const openApiKeySettings = useCallback(() => {
    if (!providerId) {
      return;
    }

    router.push({
      params: {
        ...(provider?.name ? { providerName: provider.name } : {}),
        providerId,
      },
      pathname: '/settings/provider/[providerId]/api-key-settings',
    });
  }, [provider, providerId, router]);
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
  const configurationActions = useMemo<HeaderToolbarAction[]>(
    () =>
      officialWebsite
        ? [
            {
              accessibilityLabel: t('common.officialWebsite'),
              androidIcon: SquareArrowOutUpRightIcon,
              icon: 'arrow.up.right.square',
              key: 'official-website',
              onPress: openOfficialWebsite,
            },
          ]
        : [],
    [officialWebsite, openOfficialWebsite, t],
  );
  const modelActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('settings.provider.models.add'),
        androidIcon: PlusIcon,
        disabled: !provider,
        icon: 'plus',
        key: 'add-model',
        onPress: openModelAddSettings,
      },
    ],
    [openModelAddSettings, provider, t],
  );
  const handleToggleProvider = useCallback(() => {
    if (!provider) {
      return;
    }

    updateProviderEnabledMutation.mutate(!provider.isEnabled);
  }, [provider, updateProviderEnabledMutation]);
  const handleDeleteProvider = useCallback(async () => {
    if (!providerId) {
      return;
    }

    try {
      await deleteProviderMutation.mutateAsync(providerId);
      toast.show({ label: t('settings.provider.toast.deleted'), variant: 'success' });
      router.back();
    } catch {
      toast.show({ label: t('settings.provider.toast.deleteFailed'), variant: 'danger' });
    }
  }, [deleteProviderMutation, providerId, router, t, toast]);
  const requestDeleteProvider = useCallback(() => {
    if (!provider || !canDeleteProvider(provider)) {
      return;
    }

    requestConfirm({
      message: t('settings.provider.delete.message', { name: provider.name }),
      onConfirm: handleDeleteProvider,
      title: t('settings.provider.delete.title'),
    });
  }, [handleDeleteProvider, provider, requestConfirm, t]);

  if (!providerId || providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  if (isProviderDetailLoading) {
    return (
      <>
        <BackHeader
          rightActions={configurationActions}
          title={providerName ?? t('settings.pages.provider.title')}
        />
        <View className="flex-1 items-center justify-center">
          <Spinner accessibilityLabel={t('settings.provider.loading')} />
        </View>
      </>
    );
  }

  return (
    <>
      <BackHeader
        rightActions={activeTab === 'models' ? modelActions : configurationActions}
        title={providerName ?? t('settings.provider.tabs.configuration')}
        titleElement={
          provider ? <ProviderDetailTabs onTabChange={setActiveTab} tab={activeTab} /> : undefined
        }
      />
      {activeTab === 'configuration' ? (
        <ScrollView
          alwaysBounceVertical={false}
          contentContainerStyle={styles.configurationContent}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          style={styles.screen}
        >
          <ProviderApiManagementSection
            apiKeysInput={apiKeysInput}
            apiKeysVisible={apiKeysVisible}
            baseUrl={getProviderPrimaryBaseUrl(provider)}
            provider={provider}
            showApiKeys={showApiKeys}
            showBaseUrl={canEditEndpoint}
            onApiKeysManagePress={openApiKeySettings}
            onApiKeysVisibleToggle={() => setApiKeysVisible((visible) => !visible)}
            onBaseUrlManagePress={openEndpointSettings}
          />
        </ScrollView>
      ) : (
        <ProviderModelList
          isLoading={modelsQuery.isPending}
          models={models}
          provider={provider}
          toolbarActions={{
            check: {
              isDisabled: models.length === 0,
              isLoading: isModelChecking,
              onPress: openCheckSheet,
            },
            pull: {
              isDisabled: !provider || isModelPullLoading,
              isLoading: isModelPullLoading,
              onPress: () => void openModelPullSettings(),
            },
          }}
        />
      )}
      <ProviderModelCheckSheet
        apiKeyOptions={checkApiKeyOptions}
        isChecking={isModelChecking}
        isOpen={isCheckSheetOpen}
        models={models}
        selectedApiKeyId={selectedCheckApiKeyId}
        selectedModelId={selectedCheckModelId}
        onApiKeyChange={setSelectedCheckApiKeyId}
        onClose={closeCheckSheet}
        onModelChange={setSelectedCheckModelId}
        onStart={startModelCheck}
      />
      {provider ? (
        <ProviderDetailChrome
          canDelete={canDeleteProvider(provider)}
          isActive={provider.isEnabled}
          isDisabled={updateProviderEnabledMutation.isPending || deleteProviderMutation.isPending}
          onDelete={requestDeleteProvider}
          onToggleActive={handleToggleProvider}
        />
      ) : null}
      {confirmDialog}
    </>
  );
}

const styles = StyleSheet.create({
  configurationContent: {
    gap: 20,
    paddingBottom: 96,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  screen: {
    flex: 1,
  },
});
