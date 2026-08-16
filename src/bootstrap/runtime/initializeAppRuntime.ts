import { installBenchMockProvider } from '@/backend/ai/devBench/installBenchMockProvider';
import type { BackendServices } from '@/bootstrap/composition/createBackendServices';
import { initI18n } from '@/frontend/i18n';
import { applyThemePreferences } from '@/frontend/utils/theme';

const bootPreferenceKeys = {
  fontSizeStep: 'ui.font_size_step',
  language: 'app.language',
  themeMode: 'ui.theme_mode',
} as const;

export async function initializeAppRuntime(services: BackendServices) {
  const preferences = services.preference.getMultipleCached(bootPreferenceKeys);

  applyThemePreferences(preferences.themeMode, preferences.fontSizeStep);
  await initI18n(preferences.language);

  // 布局基准的假 provider：只在 dev 构建里接管自己那一个 provider id，其余全部透传。
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    installBenchMockProvider();
  }
}
