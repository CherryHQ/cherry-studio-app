import type { BackendServices } from '@/bootstrap/composition/createBackendServices';
import { initI18n } from '@/frontend/i18n';
import { applyThemePreferences } from '@/frontend/utils/theme';

import { waitForStartupCoverPresented } from './startupCoverHandoff';

const bootPreferenceKeys = {
  fontSizeStep: 'ui.font_size_step',
  language: 'app.language',
  themeMode: 'ui.theme_mode',
} as const;

export async function initializeAppRuntime(services: BackendServices) {
  const preferences = services.preference.getMultipleCached(bootPreferenceKeys);

  // Uniwind synchronizes forced themes to the native Appearance API. Wait
  // until LaunchScreen is gone so an app preference cannot recolor it.
  await waitForStartupCoverPresented();
  applyThemePreferences(preferences.themeMode, preferences.fontSizeStep);
  await initI18n(preferences.language);
}
