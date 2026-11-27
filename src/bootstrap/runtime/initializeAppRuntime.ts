import type { BackendServices } from '@/bootstrap/composition/createBackendServices';
import i18n, { initI18n } from '@/frontend/i18n';
import { applyThemePreferences } from '@/frontend/utils/theme';
import { measureStartupStage, startStartupStage } from '@/shared/core/logger/startupDiagnostics';

const bootPreferenceKeys = {
  fontSizeStep: 'ui.font_size_step',
  language: 'app.language',
  themeMode: 'ui.theme_mode',
} as const;

export async function initializeAppRuntime(services: BackendServices) {
  const preferences = services.preference.getMultipleCached(bootPreferenceKeys);

  await measureStartupStage('startup.i18n', () => initI18n(preferences.language));
  await measureStartupStage('startup.agent', () =>
    services.agentData.createInitialAgent({ name: i18n.t('agent.default.name') }),
  );
  // Uniwind synchronizes forced themes to the native Appearance API; apply it
  // last so native appearance updates as close to splash dismissal as possible.
  const finishTheme = startStartupStage('startup.theme');
  try {
    applyThemePreferences(preferences.themeMode, preferences.fontSizeStep);
    finishTheme();
  } catch (error) {
    finishTheme('failed');
    throw error;
  }
}
