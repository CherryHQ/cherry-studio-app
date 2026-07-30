import { resolveProviderIcon } from '@cherrystudio/ui/icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useUniwind } from 'uniwind';
import { MOBILE_SUPPORTED_WEB_SEARCH_PROVIDERS } from '@/data/presets/webSearchProviders';
import { BackHeader } from '@/frontend/components/headers';
import type { WebSearchProviderId } from '@/shared/data/preference';
import { SettingNumberInput } from '../components/SettingNumberInput';
import { SettingSelect, type SettingSelectOption } from '../components/SettingSelect';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsServiceRow, type SettingsServiceRowProps } from '../components/SettingsServiceRow';
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
  const apiWebSearchProviderItems = useMemo<SettingsServiceRowProps[]>(
    () =>
      MOBILE_SUPPORTED_WEB_SEARCH_PROVIDERS.flatMap((provider) => {
        if (provider.type !== 'api') {
          return [];
        }

        return [
          {
            id: provider.id,
            imageSource: resolveWebSearchProviderIcon(provider.id)?.[iconTheme],
            isEnabled: true,
            name: provider.name,
            onPress: () =>
              router.push({
                pathname: './websearch/[providerId]',
                params: { providerId: provider.id },
              }),
          },
        ];
      }),
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
        <SettingsSection
          items={[
            {
              accessory: (
                <SettingSelect
                  isClearable
                  label={t('settings.websearch.defaultProvider')}
                  options={searchKeywordProviderOptions}
                  value={webSearchProviders.searchKeywords.value}
                  onValueChange={webSearchProviders.searchKeywords.onValueChange}
                />
              ),
              title: t('settings.websearch.defaultProvider'),
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
          <View className="overflow-hidden rounded-xl bg-settings-grouped-surface">
            {apiWebSearchProviderItems.map((item, index) => (
              <SettingsServiceRow key={item.id} {...item} showSeparator={index > 0} />
            ))}
          </View>
        </View>
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
