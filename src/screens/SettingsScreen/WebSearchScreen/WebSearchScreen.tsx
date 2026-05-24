import { resolveProviderIcon } from '@cherrystudio/ui/icons-png/providers';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { BackHeader } from '@/components/headers';
import type { WebSearchProviderId } from '@/data/preference';
import { PRESETS_WEB_SEARCH_PROVIDERS } from '@/data/presets/webSearchProviders';
import { SettingNumberInput } from '../components/SettingNumberInput';
import { SettingSelect } from '../components/SettingSelect';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsServiceRow, type SettingsServiceRowProps } from '../components/SettingsServiceRow';
import { useWebSearchProviderPreferences } from '../hooks/useWebSearchProviderPreferences';

export default function WebSearchSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { theme } = useUniwind();
  const iconTheme = theme === 'dark' ? 'dark' : 'light';
  const webSearchProviders = useWebSearchProviderPreferences();
  const apiWebSearchProviderItems = useMemo<SettingsServiceRowProps[]>(
    () =>
      PRESETS_WEB_SEARCH_PROVIDERS.filter((provider) => provider.type === 'api').map(
        (provider) => ({
          id: provider.id,
          imageSource: resolveWebSearchProviderIcon(provider.id)?.[iconTheme],
          isEnabled: true,
          name: provider.name,
          onPress: () =>
            router.push({
              pathname: './websearch/[providerId]',
              params: { providerId: provider.id },
            }),
        }),
      ),
    [iconTheme, router],
  );

  return (
    <>
      <BackHeader title={t('settings.pages.websearch.title')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1 bg-background"
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <SettingsSection
          items={[
            {
              accessory: (
                <SettingSelect
                  label={t('settings.websearch.defaultProvider')}
                  options={webSearchProviders.searchKeywords.options}
                  value={webSearchProviders.searchKeywords.value}
                  onValueChange={webSearchProviders.searchKeywords.onValueChange}
                />
              ),
              title: t('settings.websearch.defaultProvider'),
            },
            {
              accessory: (
                <SettingSelect
                  label={t('settings.websearch.fetchUrlsProvider')}
                  options={webSearchProviders.fetchUrls.options}
                  value={webSearchProviders.fetchUrls.value}
                  onValueChange={webSearchProviders.fetchUrls.onValueChange}
                />
              ),
              title: t('settings.websearch.fetchUrlsProvider'),
            },
            {
              accessory: (
                <SettingNumberInput
                  accessibilityLabel={t('settings.websearch.maxResults')}
                  value={webSearchProviders.maxResults.value}
                  onValueChange={webSearchProviders.maxResults.onValueChange}
                />
              ),
              title: t('settings.websearch.maxResults'),
            },
            {
              accessory: (
                <SettingSelect
                  label={t('settings.websearch.compressionMethod')}
                  options={webSearchProviders.compressionMethod.options}
                  value={webSearchProviders.compressionMethod.value}
                  onValueChange={webSearchProviders.compressionMethod.onValueChange}
                />
              ),
              title: t('settings.websearch.compressionMethod'),
            },
            ...(webSearchProviders.compressionMethod.value === 'cutoff'
              ? [
                  {
                    accessory: (
                      <SettingNumberInput
                        accessibilityLabel={t('settings.websearch.compressionCutoffLimit')}
                        value={webSearchProviders.compressionCutoffLimit.value}
                        onValueChange={webSearchProviders.compressionCutoffLimit.onValueChange}
                      />
                    ),
                    title: t('settings.websearch.compressionCutoffLimit'),
                  },
                ]
              : []),
          ]}
          title={t('settings.websearch.general.title')}
        />
        <View className="gap-2">
          <Text className="px-1 font-medium text-default-foreground text-sm">
            {t('settings.websearch.apiProviders.title')}
          </Text>
          <View className="overflow-hidden bg-surface-secondary">
            {apiWebSearchProviderItems.map((item) => (
              <SettingsServiceRow key={item.id} {...item} />
            ))}
          </View>
        </View>
      </ScrollView>
    </>
  );
}

function resolveWebSearchProviderIcon(providerId: WebSearchProviderId) {
  if (providerId === 'fetch') {
    return resolveProviderIcon('cherryin');
  }

  if (providerId === 'exa-mcp') {
    return resolveProviderIcon('exa') ?? resolveProviderIcon('mcp');
  }

  return resolveProviderIcon(providerId);
}

const styles = StyleSheet.create({
  content: {
    gap: 24,
    paddingBottom: 20,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
});
