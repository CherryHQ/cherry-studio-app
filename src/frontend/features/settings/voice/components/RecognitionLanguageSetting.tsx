import { OptionPickerBottomSheet, Section, useToast } from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreference } from '@/frontend/data';
import type { LanguageVarious } from '@/shared/data/preference';
import { APP_LANGUAGES } from '@/shared/utils/languages';

const FOLLOW_APP = 'app';

/** Selects the system recognizer's language, with the app language as the default. */
export function RecognitionLanguageSetting({
  capability,
}: {
  capability: 'dictation' | 'transcription';
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const label = t(
    capability === 'dictation'
      ? 'settings.voice.dictationLanguage'
      : 'settings.voice.transcription.language',
  );
  const [selected, setSelected] = usePreference(
    capability === 'dictation'
      ? 'feature.voice.dictation_language'
      : 'feature.voice.transcription_language',
  );
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const options = [
    { value: FOLLOW_APP, label: t('settings.voice.followAppLanguage') },
    ...APP_LANGUAGES,
  ];
  const value = selected ?? FOLLOW_APP;
  const change = (next: string) => {
    void setSelected(next === FOLLOW_APP ? null : (next as LanguageVarious))
      .then(() => queryClient.invalidateQueries({ queryKey: ['voice'] }))
      .catch(() => {
        toast.show({ label: t('settings.voice.saveFailed'), variant: 'danger' });
      });
  };
  return (
    <>
      <Section.SelectItem
        label={label}
        onPress={() => setIsPickerOpen(true)}
        testID={`settings-voice-${capability}-language`}
        value={options.find((option) => option.value === value)?.label ?? value}
      />
      <OptionPickerBottomSheet<string>
        onClose={() => setIsPickerOpen(false)}
        onValueChange={change}
        open={isPickerOpen}
        options={options}
        selectedValue={value}
        size="medium"
        title={label}
      />
    </>
  );
}
