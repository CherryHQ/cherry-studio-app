import type { BackendServices } from '@/bootstrap/composition/createBackendServices';
import i18n, { initI18n } from '@/frontend/i18n';
import { applyThemePreferences } from '@/frontend/utils/theme';
import { measureStartupStage, startStartupStage } from '@/shared/core/logger/startupDiagnostics';

import { waitForStartupCoverPresented } from './startupCoverHandoff';

const bootPreferenceKeys = {
  fontSizeStep: 'ui.font_size_step',
  language: 'app.language',
  themeMode: 'ui.theme_mode',
  themePalette: 'ui.theme_palette',
} as const;

export async function initializeAppRuntime(services: BackendServices) {
  const preferences = services.preference.getMultipleCached(bootPreferenceKeys);

  // Uniwind synchronizes forced themes to the native Appearance API. Wait
  // until LaunchScreen is gone so an app preference cannot recolor it.
  await measureStartupStage('startup.cover.wait', waitForStartupCoverPresented);
  const finishTheme = startStartupStage('startup.theme');
  try {
    applyThemePreferences(
      preferences.themeMode,
      preferences.fontSizeStep,
      preferences.themePalette,
    );
    finishTheme();
  } catch (error) {
    finishTheme('failed');
    throw error;
  }
  await measureStartupStage('startup.i18n', () => initI18n(preferences.language));
  await measureStartupStage('startup.agent', () =>
    services.agentData.createInitialAgent({ name: i18n.t('agent.default.name') }),
  );
}
