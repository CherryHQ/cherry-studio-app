import { Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { SettingsScrollPage } from '../components/SettingsScrollPage';
import { useWebSearchProviderPreferences } from '../hooks/useWebSearchProviderPreferences';

export default function WebSearchCompressionMethodScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { compressionMethod } = useWebSearchProviderPreferences();

  return (
    <SettingsScrollPage headerProps={{ title: t('settings.websearch.compressionMethod') }}>
      <Section>
        {compressionMethod.options.map((option) => {
          const selected = option.value === compressionMethod.value;

          return (
            <Section.RadioItem
              key={option.value}
              label={option.label}
              onPress={() => {
                if (!selected) {
                  compressionMethod.onValueChange(option.value);
                  router.back();
                }
              }}
              selected={selected}
            />
          );
        })}
      </Section>
    </SettingsScrollPage>
  );
}
