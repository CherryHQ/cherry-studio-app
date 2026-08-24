import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { SettingNumberInput } from '../components/SettingNumberInput';
import { SettingsScrollPage } from '../components/SettingsScrollPage';
import { useWebSearchProviderPreferences } from '../hooks/useWebSearchProviderPreferences';

export default function WebSearchAdvancedScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const webSearchProviders = useWebSearchProviderPreferences();
  const selectedCompressionMethod = webSearchProviders.compressionMethod.options.find(
    (option) => option.value === webSearchProviders.compressionMethod.value,
  );

  return (
    <SettingsScrollPage
      headerProps={{ title: t('settings.websearch.advanced.title') }}
      keyboardShouldPersistTaps="handled"
    >
      <Section>
        <Section.Item
          label={t('settings.websearch.maxResults')}
          trailing={
            <SettingNumberInput
              accessibilityLabel={t('settings.websearch.maxResults')}
              compact
              value={webSearchProviders.maxResults.value}
              onValueChange={webSearchProviders.maxResults.onValueChange}
            />
          }
        />
        <Section.Item
          label={t('settings.websearch.compressionMethod')}
          onPress={() => router.push('/settings/websearch/compression-method')}
          trailing={
            <View className="min-w-0 flex-row items-center justify-end gap-1">
              <Text
                className="min-w-0 shrink text-right text-base text-foreground"
                numberOfLines={1}
              >
                {selectedCompressionMethod?.label ?? t('settings.select.placeholder')}
              </Text>
              <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
            </View>
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
    </SettingsScrollPage>
  );
}
