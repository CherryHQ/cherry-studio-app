import { OptionPickerBottomSheet, Section } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  'zh-CN',
  'zh-TW',
  'en-US',
  'ja-JP',
  'ko-KR',
  'fr-FR',
  'de-DE',
  'es-ES',
  'pt-PT',
  'ru-RU',
  'vi-VN',
];

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
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const names = new Intl.DisplayNames([i18n.language], { type: 'language' });
  const options = [
    ...(allowDefault ? [{ value: '', label: t('translation.language.followApp') }] : []),
    ...[...new Set([...(value ? [value] : []), ...LANGUAGES])].map((language) => ({
      value: language,
      label: names.of(language) ?? language,
    })),
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
