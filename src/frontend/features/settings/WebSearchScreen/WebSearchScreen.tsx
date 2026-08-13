import { Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { ChevronRightIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { BackHeader } from '@/frontend/components/headers';
import { Image } from '@/frontend/components/nativePrimitives';

import { useWebSearchProviderPreferences } from '../hooks/useWebSearchProviderPreferences';
import { WebSearchApiManagementSection } from './components/WebSearchApiManagementSection';
import { resolveWebSearchProviderIcon } from './utils/providerIcons';
import { getWebSearchProviderPreset } from './utils/providerSettings';

export default function WebSearchSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { theme } = useUniwind();
  const webSearchProviders = useWebSearchProviderPreferences();
  const searchProvider = getWebSearchProviderPreset(webSearchProviders.searchKeywords.value);
  const fetchProvider = getWebSearchProviderPreset(webSearchProviders.fetchUrls.value);
  const iconTheme = theme === 'dark' ? 'dark' : 'light';

  return (
    <>
      <BackHeader title={t('settings.pages.websearch.title')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerClassName="gap-6 px-4 py-5"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <WebSearchApiManagementSection
          afterItems={
            <Section.Item
              label={t('settings.websearch.advanced.title')}
              onPress={() => router.push('/settings/websearch/advanced')}
            />
          }
          capability="searchKeywords"
          provider={searchProvider}
          providerOverrides={webSearchProviders.providerOverrides.value}
          onCapabilityApiHostChange={webSearchProviders.providerOverrides.onCapabilityApiHostChange}
          onProviderOverrideChange={webSearchProviders.providerOverrides.onProviderOverrideChange}
        >
          <Section.Item
            label={t('settings.websearch.provider.selection')}
            onPress={() => router.push('/settings/websearch/default-provider')}
            trailing={<ProviderSelectionValue iconTheme={iconTheme} provider={searchProvider} />}
          />
        </WebSearchApiManagementSection>

        <WebSearchApiManagementSection
          capability="fetchUrls"
          provider={fetchProvider}
          providerOverrides={webSearchProviders.providerOverrides.value}
          onCapabilityApiHostChange={webSearchProviders.providerOverrides.onCapabilityApiHostChange}
          onProviderOverrideChange={webSearchProviders.providerOverrides.onProviderOverrideChange}
        >
          <Section.Item
            label={t('settings.websearch.fetchUrlsProvider')}
            onPress={() => router.push('/settings/websearch/fetch-provider')}
            trailing={<ProviderSelectionValue iconTheme={iconTheme} provider={fetchProvider} />}
          />
        </WebSearchApiManagementSection>
      </ScrollView>
    </>
  );
}

function ProviderSelectionValue({
  iconTheme,
  provider,
}: {
  iconTheme: 'dark' | 'light';
  provider: ReturnType<typeof getWebSearchProviderPreset>;
}) {
  const providerIcon = resolveWebSearchProviderIcon(provider.id)?.[iconTheme];

  return (
    <View className="min-w-0 max-w-52 flex-row items-center justify-end gap-2">
      {providerIcon ? (
        <Image
          cachePolicy="memory-disk"
          className="size-5 shrink-0"
          contentFit="contain"
          recyclingKey={provider.id}
          source={providerIcon}
        />
      ) : null}
      <Text className="min-w-0 shrink text-right text-base text-foreground" numberOfLines={1}>
        {provider.name}
      </Text>
      <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" strokeWidth={2} />
    </View>
  );
}
