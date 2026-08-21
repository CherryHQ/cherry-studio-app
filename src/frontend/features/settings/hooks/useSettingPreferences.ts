import { useAlert } from '@cherrystudio/ui/components';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { withThemeTransition } from 'react-native-nitro-theme-transition';

import { useMultiplePreferences } from '@/frontend/data/hooks';
import { initI18n, resolveLanguage } from '@/frontend/i18n';
import { themeTransition } from '@/frontend/utils/constants';
import { applyThemeModePreference } from '@/frontend/utils/theme';
import { type LanguageVarious, ThemeMode } from '@/shared/data/preference';

import { languageOptions } from '../settingOptions';

const preferenceMapping = {
  language: 'app.language',
  themeMode: 'ui.theme_mode',
} as const;

export function useSettingPreferences() {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const [preferences, setPreferences] = useMultiplePreferences(preferenceMapping);
  const persistenceVersionRef = useRef(0);
  const languageValue = resolveLanguage(preferences.language);

  const handleThemeModeChange = useCallback(
    (nextThemeMode: ThemeMode) => {
      // `getChangedKeys` drops no-op writes as well, but by the time it runs the
      // snapshot is already up — re-tapping the current swatch would play a fade
      // over nothing.
      if (nextThemeMode === preferences.themeMode) {
        return;
      }

      // Read rather than snapshotted into a ref because `enqueueUpdate` chains
      // `runUpdate` onto `updateTail`: even the optimistic cache write lands a
      // microtask later, so this closure still sees the pre-tap value. It can drift
      // from the service's own `previousValues` only when two writes fail back to
      // back with a tap in between, the same exposure `FontSizeSettingsScreen` has.
      const previousThemeMode = preferences.themeMode;
      const persistenceVersion = ++persistenceVersionRef.current;

      // Has to be synchronous: the callback runs while a snapshot of the old screen
      // covers the app and the reveal is scheduled off native frame callbacks, so an
      // async swap would land after the fade had already uncovered the new theme.
      withThemeTransition(() => applyThemeModePreference(nextThemeMode), themeTransition);

      void setPreferences({ themeMode: nextThemeMode }, { optimistic: true }).catch(() => {
        if (persistenceVersion !== persistenceVersionRef.current) {
          return;
        }

        // Deliberately not wrapped in a transition. A failed write should read as a
        // failure, not as another polished crossfade, and `alert.show` puts up a
        // UIAlertController — a system window no snapshot can contain, so it would
        // land on top of a frozen copy of the app while that copy faded underneath.
        applyThemeModePreference(previousThemeMode);
        alert.show({ title: t('settings.appearance.saveFailed') });
      });
    },
    [alert, preferences.themeMode, setPreferences, t],
  );

  const handleLanguageChange = useCallback(
    (nextLanguage: LanguageVarious) => {
      void setPreferences({ language: nextLanguage }).then(() => initI18n(nextLanguage));
    },
    [setPreferences],
  );

  return {
    language: {
      options: languageOptions,
      value: languageValue,
      onValueChange: handleLanguageChange,
    },
    theme: {
      value: preferences.themeMode,
      onValueChange: handleThemeModeChange,
    },
  };
}
