import type { MenuItem } from '@cherrystudio/ui/components';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { APP_LANGUAGES, resolveAppLanguage, type AppLanguage } from '@/shared/utils/languages';

/** Shared tap-menu choices for message and Skill translation. Opening the menu makes no request. */
export function useTranslationLanguageMenu({
  onSelect,
  selectedLanguage,
}: {
  onSelect: (language: AppLanguage) => void;
  selectedLanguage?: AppLanguage;
}): readonly MenuItem[] {
  const { i18n } = useTranslation();
  const highlightedLanguage =
    selectedLanguage ?? resolveAppLanguage(i18n.resolvedLanguage ?? i18n.language);

  return useMemo(
    () =>
      APP_LANGUAGES.map(({ label, value }) => ({
        checked: value === highlightedLanguage,
        id: `translation-language-${value}`,
        label,
        // Selecting the checked language also starts or retries translation.
        onPress: () => onSelect(value),
      })),
    [highlightedLanguage, onSelect],
  );
}
