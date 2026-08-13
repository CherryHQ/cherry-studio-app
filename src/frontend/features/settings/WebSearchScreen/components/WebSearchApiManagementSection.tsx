import { Section } from '@cherrystudio/ui/components';
import type {
  WebSearchCapability,
  WebSearchProviderId,
  WebSearchProviderOverride,
  WebSearchProviderOverrides,
} from '@cherrystudio/universal/data/preference';
import type { WebSearchProviderPreset } from '@cherrystudio/universal/data/presets/webSearchProviders';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { WebSearchApiServiceFieldGroup } from '../apiService/components/WebSearchApiServiceFields';
import {
  WebSearchApiManagementContext,
  type WebSearchApiManagementContextValue,
} from '../context/WebSearchApiManagementContext';
import { getWebSearchProviderDetailSections } from '../utils/providerSettings';

type WebSearchApiManagementSectionProps = {
  afterItems?: React.ReactNode;
  capability: WebSearchCapability;
  children: React.ReactNode;
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
  afterItems,
  capability,
  children,
  onCapabilityApiHostChange,
  onProviderOverrideChange,
  provider,
  providerOverrides,
}: WebSearchApiManagementSectionProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const providerOverride = providerOverrides[provider.id];
  const sections = getWebSearchProviderDetailSections(provider.id);
  const combinesApiKeysAndHost =
    sections.some((section) => section.type === 'apiKeys') &&
    sections.some((section) => section.type === 'capabilityApiHosts');

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
        capability,
        provider,
        providerOverride,
      },
    }),
    [
      onCapabilityApiHostChange,
      onProviderOverrideChange,
      openApiKeySettings,
      openZhipuApiKeySettings,
      capability,
      provider,
      providerOverride,
      t,
    ],
  );

  return (
    <WebSearchApiManagementContext value={contextValue}>
      <Section>
        {children}
        {sections.map((section) => (
          <WebSearchApiServiceFieldGroup
            capability={capability}
            combinesApiKeysAndHost={combinesApiKeysAndHost}
            key={section.type}
            section={section}
          />
        ))}
        {afterItems}
      </Section>
    </WebSearchApiManagementContext>
  );
}
