import { Section } from '@cherrystudio/ui/components';
import { MOBILE_SUPPORTED_WEB_SEARCH_PROVIDERS } from '@cherrystudio/universal/data/presets/webSearchProviders';
import { useRouter } from 'expo-router';
import { ChevronRightIcon } from 'lucide-uniwind/png';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { BackHeader } from '@/frontend/components/headers';
import { Image } from '@/frontend/components/nativePrimitives';

import { SettingNumberInput } from '../components/SettingNumberInput';
import { useWebSearchProviderPreferences } from '../hooks/useWebSearchProviderPreferences';
import { resolveWebSearchProviderIcon } from './utils/providerIcons';

export default function WebSearchSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { theme } = useUniwind();
  const iconTheme = theme === 'dark' ? 'dark' : 'light';
  const webSearchProviders = useWebSearchProviderPreferences();
  const selectedSearchProvider = webSearchProviders.searchKeywords.options.find(
    (option) => option.value === webSearchProviders.searchKeywords.value,
  );
  const selectedCompressionMethod = webSearchProviders.compressionMethod.options.find(
    (option) => option.value === webSearchProviders.compressionMethod.value,
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
            onPress={() => router.push('/settings/websearch/default-provider')}
            trailing={
              <SelectionValue
                imageSource={
                  resolveWebSearchProviderIcon(webSearchProviders.searchKeywords.value)?.[iconTheme]
                }
                label={selectedSearchProvider?.label ?? t('settings.select.placeholder')}
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
            onPress={() => router.push('/settings/websearch/compression-method')}
            trailing={
              <SelectionValue
                label={selectedCompressionMethod?.label ?? t('settings.select.placeholder')}
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

function SelectionValue({
  imageSource,
  label,
}: {
  imageSource?: React.ComponentProps<typeof Image>['source'];
  label: string;
}) {
  return (
    <View className="min-w-0 max-w-52 flex-row items-center justify-end gap-2">
      {imageSource ? (
        <Image className="size-5 shrink-0" contentFit="contain" source={imageSource} />
      ) : null}
      <Text
        className="min-w-0 shrink text-right text-base text-default-foreground"
        numberOfLines={1}
      >
        {label}
      </Text>
      <ChevronRightIcon className="size-5 shrink-0 text-default-foreground" strokeWidth={2} />
    </View>
  );
}
