import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { withUniwind } from 'uniwind';

import { BackHeader } from '@/components/headers';
import {
  buildApiKeyEntriesFromInput,
  canEditProviderEndpoint,
  shouldShowApiKeys,
  useProviderApiServiceDraft,
  useProviderApiServiceQueries,
} from '@/screens/SettingsScreen/ProviderScreen/apiService';
import { ProviderApiManagementSection } from './components/ProviderApiManagementSection';
import { ProviderModelList } from './components/ProviderModelList';
import { useProviderDetailSettings } from './detail';

const StyledPressable = withUniwind(Pressable);

export default function ProviderDetailSettingsScreen() {
  const { providerId, providerName } = useLocalSearchParams<{
    providerId?: string;
    providerName?: string;
  }>();
  const { t } = useTranslation();
  const router = useRouter();
  const [apiKeysVisible, setApiKeysVisible] = useState(false);
  const { models, modelsQuery, provider, providerQuery, updateProviderEnabledMutation } =
    useProviderDetailSettings(providerId ?? '');
  const { apiKeys, apiKeysQuery, authConfig, authConfigQuery, replaceApiKeysMutation } =
    useProviderApiServiceQueries(providerId ?? '');
  const { draft, primaryBaseUrl, syncApiKeysDraft, updateApiKeysInput } =
    useProviderApiServiceDraft({
      apiKeys,
      authConfig,
      provider,
    });
  const commitApiKeysInput = useCallback(
    async (value: string) => {
      if (!providerId || !draft) {
        return;
      }

      const nextApiKeys = buildApiKeyEntriesFromInput(value, draft.apiKeyEntries);
      updateApiKeysInput(value);

      try {
        await replaceApiKeysMutation.mutateAsync(nextApiKeys);
        syncApiKeysDraft(providerId, nextApiKeys);
      } catch {
        Alert.alert(t('settings.provider.apiService.saveFailed'));
      }
    },
    [draft, providerId, replaceApiKeysMutation, syncApiKeysDraft, t, updateApiKeysInput],
  );
  const canEditEndpoint = canEditProviderEndpoint(provider);
  const showApiKeys = draft ? shouldShowApiKeys(draft.authDraft.type) : false;
  const isApiDraftLoading = apiKeysQuery.isPending || authConfigQuery.isPending || !draft;
  const openEndpointSettings = () => {
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
  };
  const openApiKeySettings = () => {
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
  };

  if (!providerId || providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  return (
    <>
      <BackHeader title={providerName ?? t('settings.pages.provider.title')} />
      <StyledPressable
        accessible={false}
        className="flex-1 bg-background"
        onPress={Keyboard.dismiss}
      >
        <ScrollView
          alwaysBounceVertical={false}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}
        >
          <View className="gap-6 px-4 py-5">
            <ProviderApiManagementSection
              apiKeysInput={draft?.apiKeysInput}
              apiKeysVisible={apiKeysVisible}
              baseUrl={primaryBaseUrl}
              isUpdatingEnabled={updateProviderEnabledMutation.isPending}
              provider={provider}
              showApiKeys={!isApiDraftLoading && showApiKeys}
              showBaseUrl={!isApiDraftLoading && canEditEndpoint}
              onApiKeysInputChange={commitApiKeysInput}
              onApiKeysManagePress={openApiKeySettings}
              onApiKeysVisibleToggle={() => setApiKeysVisible((visible) => !visible)}
              onBaseUrlManagePress={openEndpointSettings}
              onEnabledChange={(enabled) => updateProviderEnabledMutation.mutate(enabled)}
            />
            <ProviderModelList isLoading={modelsQuery.isPending} models={models} />
          </View>
        </ScrollView>
      </StyledPressable>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
  scrollView: {
    flex: 1,
  },
});
