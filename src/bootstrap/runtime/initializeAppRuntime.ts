import type { BackendServices } from '@/bootstrap/composition/createBackendServices';
import { initI18n } from '@/frontend/i18n';
import { applyThemeModePreference } from '@/frontend/utils/theme';

const bootPreferenceKeys = {
  language: 'app.language',
  themeMode: 'ui.theme_mode',
} as const;

export async function initializeAppRuntime(services: BackendServices) {
  const preferences = services.preference.getMultipleCached(bootPreferenceKeys);

  applyThemeModePreference(preferences.themeMode);
  await initI18n(preferences.language);
}
