import { OptionPickerBottomSheet, Section } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWebSearchProviderPreferences } from '../hooks/useWebSearchProviderPreferences';
import { SettingNumberInput } from './SettingNumberInput';

/** Result count and compression apply only to keyword search, so only its tool page shows them. */
export function WebSearchAdvancedSection() {
  const { t } = useTranslation();
  const [isCompressionMethodPickerOpen, setIsCompressionMethodPickerOpen] = useState(false);
  const webSearchProviders = useWebSearchProviderPreferences();
  const selectedCompressionMethod = webSearchProviders.compressionMethod.options.find(
    (option) => option.value === webSearchProviders.compressionMethod.value,
  );

  return (
    <>
      <Section title={t('settings.websearch.advanced.title')}>
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
