import { Spinner } from '@cherrystudio/ui/components';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useToast } from 'heroui-native/toast';
import { PlusIcon, SquareArrowOutUpRightIcon } from 'lucide-uniwind/png';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useAppAlert } from '@/frontend/components/AppAlertProvider';
import { BackHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import { useBackendModule, useMutation } from '@/frontend/data';
import {
  dataApiCollectionFilters,
  restoreQuerySnapshot,
  updateQueriesOptimistically,
} from '@/frontend/data/utils/optimisticQueryUpdate';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

import {
  buildApiKeyEntriesFromInput,
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
import { useProviderModelPull } from './models/hooks/useProviderModelPull';
import { stashProviderModelPullPreview } from './models/utils/providerModelPullPreviewStore';

export default function ProviderDetailSettingsScreen() {
  const { providerId, providerName } = useLocalSearchParams<{
    providerId?: string;
    providerName?: string;
  }>();
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { showConfirmation, showMessage } = useAppAlert();
  const providers = useBackendModule('providers');
  const [apiKeysVisible, setApiKeysVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<ProviderDetailTab>('configuration');
  const { models, modelsQuery, provider, providerQuery, updateProviderEnabledMutation } =
    useProviderDetailSettings(providerId ?? '');
  const deleteProviderMutation = useMutation('DELETE', '/providers/:id', {
    onMutate: async (variables) => {
      const providerIdToDelete = variables?.params.id;
      const providers = await updateQueriesOptimistically<Provider[]>(
        queryClient,
        dataApiCollectionFilters('/providers'),
        (current) => current?.filter((item) => item.id !== providerIdToDelete),
      );

      return { providers };
    },
    onError: (_error, _variables, context) => {
      restoreQuerySnapshot(queryClient, context?.providers);
    },
    onSuccess: (_result, variables) => {
      if (variables) {
        queryClient.removeQueries({ queryKey: [`/providers/${variables.params.id}`] });
      }
    },
    refresh: ['/providers'],
  });
  const { apiKeys, apiKeysQuery, authConfig, authConfigQuery, replaceApiKeysMutation } =
    useProviderApiServiceQueries(providerId ?? '');
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
  const commitApiKeys = useCallback(
    (input: string) => {
      const nextApiKeys = buildApiKeyEntriesFromInput(input, apiKeys ?? []);

      void replaceApiKeysMutation.mutateAsync(nextApiKeys).catch(() => {
        toast.show({ label: t('settings.provider.apiService.saveFailed'), variant: 'danger' });
      });
    },
    [apiKeys, replaceApiKeysMutation, t, toast],
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
  const openModelCheckSettings = useCallback(() => {
    if (!providerId || models.length === 0) {
      return;
    }

    router.push({
      params: {
        ...(provider?.name ? { providerName: provider.name } : {}),
        providerId,
      },
      pathname: '/settings/provider/[providerId]/model-check',
    });
  }, [models.length, provider, providerId, router]);
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
  const checkAction = useMemo(
    () => ({
      isDisabled: models.length === 0,
      isLoading: false,
      onPress: openModelCheckSettings,
    }),
    [models.length, openModelCheckSettings],
  );
  const pullAction = useMemo(
    () =>
      activeTab === 'models'
        ? {
            isDisabled: !provider || isModelPullLoading,
            isLoading: isModelPullLoading,
            onPress: () => void openModelPullSettings(),
          }
        : undefined,
    [activeTab, isModelPullLoading, openModelPullSettings, provider],
  );
  const handleToggleProvider = useCallback(() => {
    if (!provider) {
      return;
    }

    updateProviderEnabledMutation.mutate(!provider.isEnabled);
  }, [provider, updateProviderEnabledMutation]);
  const handleDeleteProvider = useCallback(() => {
    if (!providerId) {
      return;
    }

    const deletion = deleteProviderMutation.trigger({ params: { id: providerId } });
    router.back();
    void deletion
      .then(() => {
        toast.show({ label: t('settings.provider.toast.deleted'), variant: 'success' });
      })
      .catch(() => {
        showMessage({ title: t('settings.provider.toast.deleteFailed') });
      });
  }, [deleteProviderMutation, providerId, router, showMessage, t, toast]);
  const requestDeleteProvider = useCallback(() => {
    if (!provider || !providers.canRemove(provider)) {
      return;
    }

    showConfirmation({
      confirmLabel: t('common.delete'),
      description: t('settings.provider.delete.message', { name: provider.name }),
      onConfirm: handleDeleteProvider,
      role: 'destructive',
      title: t('settings.provider.delete.title'),
    });
  }, [handleDeleteProvider, provider, providers, showConfirmation, t]);

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
      <BackHeader
        rightActions={activeTab === 'models' ? modelActions : configurationActions}
        title={providerName ?? t('settings.provider.tabs.configuration')}
        titleElement={<ProviderDetailTabs onTabChange={setActiveTab} tab={activeTab} />}
      />
      {activeTab === 'configuration' ? (
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
            <ProviderApiManagementSection
              apiKeysInput={apiKeysInput}
              apiKeysVisible={apiKeysVisible}
              baseUrl={getProviderPrimaryBaseUrl(provider)}
              provider={provider}
              showApiKeys={showApiKeys}
              showBaseUrl={canEditEndpoint}
              onApiKeysCommit={commitApiKeys}
              onApiKeysManagePress={openApiKeySettings}
              onApiKeysVisibleToggle={() => setApiKeysVisible((visible) => !visible)}
              onBaseUrlManagePress={openEndpointSettings}
            />
          )}
        </ScrollView>
      ) : (
        <ProviderModelList
          isLoading={modelsQuery.isPending}
          models={models}
          provider={provider}
          pullAction={pullAction}
        />
      )}
      {/* Mounted from the first frame — installing a bottom toolbar later is a
          native nav-item change, which is what the loading branch used to do. */}
      <ProviderDetailChrome
        canDelete={provider ? providers.canRemove(provider) : false}
        checkAction={checkAction}
        isActive={provider?.isEnabled ?? false}
        isDisabled={
          !provider || updateProviderEnabledMutation.isPending || deleteProviderMutation.isLoading
        }
        onDelete={requestDeleteProvider}
        onToggleActive={handleToggleProvider}
        pullAction={pullAction}
      />
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
