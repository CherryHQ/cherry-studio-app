import { Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { WebSearchProviderPreset } from '@/shared/data/presets/webSearchProviders';
import type {
  WebSearchCapability,
  WebSearchProviderId,
  WebSearchProviderOverride,
  WebSearchProviderOverrides,
} from '@/shared/data/types/webSearch';

import { WebSearchApiServiceFieldGroup } from '../apiService/components/WebSearchApiServiceFields';
import { useWebSearchProviderCheck } from '../apiService/hooks/useWebSearchProviderCheck';
import {
  WebSearchApiManagementContext,
  type WebSearchApiManagementContextValue,
} from '../context/WebSearchApiManagementContext';
import {
  getWebSearchProviderCapability,
  getWebSearchProviderCheckPlacement,
  getWebSearchProviderDetailSections,
  isSelfHostedWebSearchProvider,
  mergeWebSearchProviderOverride,
} from '../utils/providerSettings';

type WebSearchApiManagementSectionProps = {
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
  capability,
  children,
  onProviderOverrideChange,
  provider,
  providerOverrides,
}: WebSearchApiManagementSectionProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const providerOverride = providerOverrides[provider.id];
  const providerCapability = getWebSearchProviderCapability(provider, capability);
  const { isChecking, startCheck } = useWebSearchProviderCheck(provider.id, capability);

  const openZhipuApiKeySettings = useCallback(() => {
    router.push({
      params: {
        providerId: 'zhipu',
        providerName: 'ZhiPu',
      },
      pathname: '/settings/provider/[providerId]',
    });
  }, [router]);

  if (!providerCapability) {
    // A stored selection the provider no longer serves; the picker is all there is to show.
    return <Section>{children}</Section>;
  }

  const check = (patch: WebSearchProviderOverride) => {
    const override = mergeWebSearchProviderOverride(
      { [provider.id]: providerOverride },
      provider.id,
      patch,
    )[provider.id];
    // Several keys rotate; a check answers for the first one.
    void startCheck({ ...override, apiKeys: override?.apiKeys?.slice(0, 1) });
  };

  const contextValue: WebSearchApiManagementContextValue = {
    actions: {
      check,
      onProviderOverrideChange,
      openZhipuApiKeySettings,
    },
    meta: {
      t,
    },
    state: {
      capability,
      checkPlacement: getWebSearchProviderCheckPlacement(provider, capability),
      isChecking,
      provider,
      providerCapability,
      providerOverride,
    },
  };

  return (
    <WebSearchApiManagementContext value={contextValue}>
      <Section
        footer={
          provider.id === 'fetch'
            ? t('settings.websearch.provider.localExtractionDescription')
            : isSelfHostedWebSearchProvider(provider, capability)
              ? t('settings.websearch.provider.selfHostedDescription')
              : undefined
        }
      >
        {children}
        {getWebSearchProviderDetailSections(provider, capability).map((section) => (
          <WebSearchApiServiceFieldGroup key={section.type} section={section} />
        ))}
      </Section>
    </WebSearchApiManagementContext>
  );
}
