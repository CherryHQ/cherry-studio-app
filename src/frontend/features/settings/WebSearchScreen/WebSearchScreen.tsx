import { Section } from '@cherrystudio/ui/components';
import { resolveProviderIcon } from '@cherrystudio/ui/icons';
import type { WebSearchProviderId } from '@cherrystudio/universal/data/preference';
import { MOBILE_SUPPORTED_WEB_SEARCH_PROVIDERS } from '@cherrystudio/universal/data/presets/webSearchProviders';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { useUniwind } from 'uniwind';

import { BackHeader } from '@/frontend/components/headers';
import { Image } from '@/frontend/components/nativePrimitives';

import { SettingNumberInput } from '../components/SettingNumberInput';
import { SettingSelect, type SettingSelectOption } from '../components/SettingSelect';
import { useWebSearchProviderPreferences } from '../hooks/useWebSearchProviderPreferences';

export default function WebSearchSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { theme } = useUniwind();
  const iconTheme = theme === 'dark' ? 'dark' : 'light';
  const webSearchProviders = useWebSearchProviderPreferences();
  const searchKeywordProviderOptions = useWebSearchProviderIconOptions(
    webSearchProviders.searchKeywords.options,
    iconTheme,
  );
  const webSearchProviderItems = useMemo(
    () =>
      MOBILE_SUPPORTED_WEB_SEARCH_PROVIDERS.map((provider) => ({
        id: provider.id,
        imageSource: resolveWebSearchProviderIcon(provider.id)?.[iconTheme],
        name: provider.name,
        onPress: () =>
          router.push({
            pathname: './websearch/[providerId]',
            params: { providerId: provider.id },
          }),
      })),
    [iconTheme, router],
  );

  return (
    <>
      <BackHeader title={t('settings.pages.websearch.title')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerClassName="gap-6 px-4 py-5"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <Section title={t('settings.websearch.general.title')}>
          <Section.Item
            label={t('settings.websearch.defaultProvider')}
            trailing={
              <SettingSelect
                label={t('settings.websearch.defaultProvider')}
                options={searchKeywordProviderOptions}
                value={webSearchProviders.searchKeywords.value}
                onValueChange={webSearchProviders.searchKeywords.onValueChange}
              />
            }
          />
          <Section.Item
            label={t('settings.websearch.maxResults')}
            trailing={
              <SettingNumberInput
                accessibilityLabel={t('settings.websearch.maxResults')}
                value={webSearchProviders.maxResults.value}
                onValueChange={webSearchProviders.maxResults.onValueChange}
              />
            }
          />
          <Section.Item
            label={t('settings.websearch.compressionMethod')}
            trailing={
              <SettingSelect
                label={t('settings.websearch.compressionMethod')}
                options={webSearchProviders.compressionMethod.options}
                value={webSearchProviders.compressionMethod.value}
                onValueChange={webSearchProviders.compressionMethod.onValueChange}
              />
            }
          />
          {webSearchProviders.compressionMethod.value === 'cutoff' ? (
            <Section.Item
              label={t('settings.websearch.compressionCutoffLimit')}
              trailing={
                <SettingNumberInput
                  accessibilityLabel={t('settings.websearch.compressionCutoffLimit')}
                  value={webSearchProviders.compressionCutoffLimit.value}
                  onValueChange={webSearchProviders.compressionCutoffLimit.onValueChange}
                />
              }
            />
          ) : null}
        </Section>
        <Section title={t('settings.websearch.apiProviders.title')}>
          {webSearchProviderItems.map((item) => (
            <Section.Item
              key={item.id}
              label={item.name}
              leading={
                item.imageSource ? (
                  <Image
                    cachePolicy="memory-disk"
                    className="size-5"
                    contentFit="contain"
                    recyclingKey={item.id}
                    source={item.imageSource}
                  />
                ) : null
              }
              onPress={item.onPress}
            />
          ))}
        </Section>
      </ScrollView>
    </>
  );
}

function useWebSearchProviderIconOptions(
  options: SettingSelectOption<WebSearchProviderId>[],
  iconTheme: 'dark' | 'light',
) {
  return useMemo(
    () =>
      options.map((option) => ({
        ...option,
        imageSource: resolveWebSearchProviderIcon(option.value)?.[iconTheme],
      })),
    [iconTheme, options],
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
