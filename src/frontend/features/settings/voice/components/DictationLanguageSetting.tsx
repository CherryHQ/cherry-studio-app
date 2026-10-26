import { OptionPickerBottomSheet, Section, useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreference } from '@/frontend/data';
import type { LanguageVarious } from '@/shared/data/preference';
import { APP_LANGUAGES } from '@/shared/utils/languages';

const FOLLOW_APP = 'app';

/** Selects the system recognizer's language, with the app language as the default. */
export function DictationLanguageSetting() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selected, setSelected] = usePreference('feature.voice.dictation_language');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const options = [
    { value: FOLLOW_APP, label: t('settings.voice.followAppLanguage') },
    ...APP_LANGUAGES,
  ];
  const value = selected ?? FOLLOW_APP;
  const change = (next: string) => {
    void setSelected(next === FOLLOW_APP ? null : (next as LanguageVarious)).catch(() => {
      toast.show({ label: t('settings.voice.saveFailed'), variant: 'danger' });
    });
  };
  return (
    <>
      <Section.SelectItem
        label={t('settings.voice.dictationLanguage')}
        onPress={() => setIsPickerOpen(true)}
        testID="settings-voice-dictation-language"
        value={options.find((option) => option.value === value)?.label ?? value}
      />
      <OptionPickerBottomSheet<string>
        onClose={() => setIsPickerOpen(false)}
        onValueChange={change}
        open={isPickerOpen}
        options={options}
        selectedValue={value}
        size="medium"
        title={t('settings.voice.dictationLanguage')}
      />
    </>
  );
}
