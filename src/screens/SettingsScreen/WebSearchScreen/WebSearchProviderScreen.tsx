import { Redirect, useLocalSearchParams } from 'expo-router';
import { SquareArrowOutUpRightIcon } from 'lucide-uniwind';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, View } from 'react-native';

import { BackHeader, type HeaderToolbarAction } from '@/components/headers';
import { WEB_SEARCH_PROVIDER_IDS, type WebSearchProviderId } from '@/data/preference';
import { useWebSearchProviderPreferences } from '../hooks/useWebSearchProviderPreferences';
import { WebSearchApiManagementSection } from './components/WebSearchApiManagementSection';
import {
  getWebSearchProviderOfficialWebsite,
  getWebSearchProviderPreset,
} from './utils/providerSettings';

function isWebSearchProviderId(value: string): value is WebSearchProviderId {
  return WEB_SEARCH_PROVIDER_IDS.includes(value as WebSearchProviderId);
}

export default function WebSearchProviderSettingsScreen() {
  const { providerId } = useLocalSearchParams<{ providerId?: string }>();
  const { t } = useTranslation();
  const webSearchProviders = useWebSearchProviderPreferences();
  const validProviderId = providerId && isWebSearchProviderId(providerId) ? providerId : undefined;
  const provider = validProviderId ? getWebSearchProviderPreset(validProviderId) : undefined;
  const officialWebsite = validProviderId
    ? getWebSearchProviderOfficialWebsite(validProviderId)
    : undefined;

  const openOfficialWebsite = useCallback(() => {
    if (!officialWebsite) {
      return;
    }

    Linking.openURL(officialWebsite).catch(() => undefined);
  }, [officialWebsite]);
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () =>
      officialWebsite
        ? [
            {
              accessibilityLabel: t('settings.websearch.provider.officialWebsite'),
              androidIcon: SquareArrowOutUpRightIcon,
              icon: 'arrow.up.right.square',
              key: 'official-website',
              onPress: openOfficialWebsite,
            },
          ]
        : [],
    [officialWebsite, openOfficialWebsite, t],
  );

  if (!provider || provider.type !== 'api') {
    return <Redirect href="/settings/websearch" />;
  }

  return (
    <>
      <BackHeader rightActions={rightActions} title={provider.name} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1 bg-background"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-4 py-5">
          <WebSearchApiManagementSection
            provider={provider}
            providerOverrides={webSearchProviders.providerOverrides.value}
            onCapabilityApiHostChange={
              webSearchProviders.providerOverrides.onCapabilityApiHostChange
            }
            onProviderOverrideChange={webSearchProviders.providerOverrides.onProviderOverrideChange}
          />
        </View>
      </ScrollView>
    </>
  );
}
