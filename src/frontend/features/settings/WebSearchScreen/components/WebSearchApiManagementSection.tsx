import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useDataServices } from '@/bootstrap';
import type {
  WebSearchCapability,
  WebSearchProvider,
  WebSearchProviderId,
  WebSearchProviderOverride,
  WebSearchProviderOverrides,
} from '@/shared/data/preference';
import type { WebSearchProviderPreset } from '@/shared/data/presets/webSearchProviders';
import { WebSearchApiServiceFieldGroup } from '../apiService/components/WebSearchApiServiceFields';
import {
  WebSearchApiManagementContext,
  type WebSearchApiManagementContextValue,
} from '../context/WebSearchApiManagementContext';
import { getWebSearchProviderDetailSections } from '../utils/providerSettings';

type WebSearchApiManagementSectionProps = {
  onCapabilityApiHostChange: (
    providerId: WebSearchProviderId,
    capability: WebSearchCapability,
    apiHost: string,
  ) => void;
  onProviderOverrideChange: (
    providerId: WebSearchProviderId,
    patch: WebSearchProviderOverride,
  ) => void;
  provider: WebSearchProviderPreset;
  providerOverrides: WebSearchProviderOverrides;
};

export function WebSearchApiManagementSection({
  onCapabilityApiHostChange,
  onProviderOverrideChange,
  provider,
  providerOverrides,
}: WebSearchApiManagementSectionProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { webSearch } = useDataServices();
  const providerOverride = providerOverrides[provider.id];
  const sections = getWebSearchProviderDetailSections(provider.id);

  const openZhipuApiKeySettings = useCallback(() => {
    router.push({
      params: {
        providerId: 'zhipu',
        providerName: 'ZhiPu',
      },
      pathname: '/settings/provider/[providerId]',
    });
  }, [router]);

  const openApiKeySettings = useCallback(() => {
    router.push({
      pathname: '/settings/websearch/[providerId]/api-key-settings',
      params: {
        providerId: provider.id,
        providerName: provider.name,
      },
    });
  }, [provider.id, provider.name, router]);
  const checkProvider = useCallback(
    (providerConfig: WebSearchProvider, capability?: WebSearchCapability) =>
      webSearch.checkProvider({ provider: providerConfig, capability }),
    [webSearch],
  );

  const contextValue = useMemo<WebSearchApiManagementContextValue>(
    () => ({
      actions: {
        onCapabilityApiHostChange,
        onProviderOverrideChange,
        checkProvider,
        openApiKeySettings,
        openZhipuApiKeySettings,
      },
      meta: {
        t,
      },
      state: {
        provider,
        providerOverride,
      },
    }),
    [
      onCapabilityApiHostChange,
      onProviderOverrideChange,
      checkProvider,
      openApiKeySettings,
      openZhipuApiKeySettings,
      provider,
      providerOverride,
      t,
    ],
  );

  return (
    <WebSearchApiManagementContext value={contextValue}>
      <View className="gap-6">
        {sections.map((section) => (
          <WebSearchApiServiceFieldGroup key={section.type} section={section} />
        ))}
      </View>
    </WebSearchApiManagementContext>
  );
}
