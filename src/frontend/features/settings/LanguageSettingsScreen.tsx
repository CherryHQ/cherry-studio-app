import { Section } from '@cherrystudio/ui/components';
import { CheckIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { BackHeader } from '@/frontend/components/headers';

import { useSettingPreferences } from './hooks/useSettingPreferences';

export default function LanguageSettingsScreen() {
  const { t } = useTranslation();
  const { language } = useSettingPreferences();

  return (
    <>
      <BackHeader title={t('settings.items.appLanguage')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerClassName="px-4 py-5"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <Section>
          {language.options.map((option) => {
            const selected = option.value === language.value;

            return (
              <Section.Item
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                key={option.value}
                label={option.label}
                onPress={() => {
                  if (!selected) {
                    language.onValueChange(option.value);
                  }
                }}
                showChevron={false}
                trailing={
                  selected ? <CheckIcon className="size-5 text-primary" strokeWidth={2.5} /> : null
                }
              />
            );
          })}
        </Section>
      </ScrollView>
    </>
  );
}
