import { Section } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { SettingsScrollPage } from './components/SettingsScrollPage';
import { useSettingPreferences } from './hooks/useSettingPreferences';

export default function LanguageSettingsScreen() {
  const { t } = useTranslation();
  const { language } = useSettingPreferences();

  return (
    <SettingsScrollPage headerProps={{ title: t('settings.items.appLanguage') }}>
      <Section>
        {language.options.map((option) => {
          const selected = option.value === language.value;

          return (
            <Section.RadioItem
              key={option.value}
              label={option.label}
              onPress={() => {
                if (!selected) {
                  language.onValueChange(option.value);
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
