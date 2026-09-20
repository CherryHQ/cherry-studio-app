import { OptionPickerBottomSheet, Section } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { APP_LANGUAGES } from '@/shared/utils/languages';

const LANGUAGES = [...APP_LANGUAGES, { value: 'ko-KR', label: '한국어' }];

export function TranslationLanguagePicker({
  value,
  onChange,
  allowDefault = false,
  disabled = false,
}: {
  value: string | null;
  onChange(value: string | null): void;
  allowDefault?: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const options = [
    ...(allowDefault ? [{ value: '', label: t('translation.language.followApp') }] : []),
    ...(value && !LANGUAGES.some((language) => language.value === value)
      ? [{ value, label: value }]
      : []),
    ...LANGUAGES,
  ];
  return (
    <>
      <Section.SelectItem
        label={t('translation.targetLanguage')}
        disabled={disabled}
        value={options.find((option) => option.value === (value ?? ''))?.label}
        onPress={() => setOpen(true)}
      />
      <OptionPickerBottomSheet
        open={open}
        onClose={() => setOpen(false)}
        onValueChange={(language) => onChange(language || null)}
        selectedValue={value ?? ''}
        options={options}
        title={t('translation.targetLanguage')}
        size="compact"
      />
    </>
  );
}
