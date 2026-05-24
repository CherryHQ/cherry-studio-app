import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type {
  WebSearchCapability,
  WebSearchProviderId,
  WebSearchProviderOverride,
  WebSearchProviderOverrides,
} from '@/data/preference';
import type { WebSearchProviderPreset } from '@/data/presets/webSearchProviders';
import { WebSearchApiServiceFieldGroup } from '../apiService';
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

  const contextValue = useMemo<WebSearchApiManagementContextValue>(
    () => ({
      actions: {
        onCapabilityApiHostChange,
        onProviderOverrideChange,
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
