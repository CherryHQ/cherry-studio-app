import { OptionPickerBottomSheet, Section } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SettingNumberInput } from '../components/SettingNumberInput';
import { SettingsScrollPage } from '../components/SettingsScrollPage';
import { useWebSearchProviderPreferences } from '../hooks/useWebSearchProviderPreferences';

export default function WebSearchAdvancedScreen() {
  const { t } = useTranslation();
  const [isCompressionMethodPickerOpen, setIsCompressionMethodPickerOpen] = useState(false);
  const webSearchProviders = useWebSearchProviderPreferences();
  const selectedCompressionMethod = webSearchProviders.compressionMethod.options.find(
    (option) => option.value === webSearchProviders.compressionMethod.value,
  );

  return (
    <>
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
          <Section.SelectItem
            label={t('settings.websearch.compressionMethod')}
            onPress={() => setIsCompressionMethodPickerOpen(true)}
            value={selectedCompressionMethod?.label ?? t('settings.select.placeholder')}
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
      <OptionPickerBottomSheet
        onClose={() => setIsCompressionMethodPickerOpen(false)}
        onValueChange={webSearchProviders.compressionMethod.onValueChange}
        open={isCompressionMethodPickerOpen}
        options={webSearchProviders.compressionMethod.options}
        selectedValue={webSearchProviders.compressionMethod.value}
        size="compact"
        testID="web-search-compression-method-picker"
        title={t('settings.websearch.compressionMethod')}
      />
    </>
  );
}
