import { Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { WebSearchProviderPreset } from '@/shared/data/presets/webSearchProviders';
import type {
  WebSearchCapability,
  WebSearchProviderId,
  WebSearchProviderOverride,
  WebSearchProviderOverrides,
} from '@/shared/data/types/webSearch';

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

  const contextValue = useMemo<WebSearchApiManagementContextValue>(
    () => ({
      actions: {
        onProviderOverrideChange,
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
    [onProviderOverrideChange, openZhipuApiKeySettings, capability, provider, providerOverride, t],
  );

  return (
    <WebSearchApiManagementContext value={contextValue}>
      <Section>
        {children}
        {sections.map((section) => (
          <WebSearchApiServiceFieldGroup key={section.type} section={section} />
        ))}
        {afterItems}
      </Section>
    </WebSearchApiManagementContext>
  );
}
