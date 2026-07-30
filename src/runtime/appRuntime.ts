import { loggerService } from '@logger';
import { Uniwind } from 'uniwind';
import { initI18n } from '@/frontend/i18n';
import type { DataServices } from '@/runtime/createDataServices';
import { ThemeMode } from '@/shared/data/preference';

const logger = loggerService.withContext('bootstrapAppRuntime');

const bootPreferenceKeys = {
  language: 'app.language',
  themeMode: 'ui.theme_mode',
} as const;

export async function bootstrapAppRuntime(services: DataServices) {
  const preferences = services.preference.getMultipleCached(bootPreferenceKeys);

  applyThemeModePreference(preferences.themeMode);
  await initI18n(preferences.language);
}

/** Runs after the Initial Data Gate opens (first paint), off the startup
 * critical path. Per ADR 0002 the gate must only wait for database readiness
 * and initial/boot preferences — data repair and diagnostics belong here, not
 * in `bootstrapAppRuntime`. Best-effort: callers fire-and-forget and a failure
 * must not surface to the user. */
export async function runPostReadyTasks(services: DataServices) {
  // The catch lives here, not in callers: they `void` this promise, so a task
  // added below without its own handling would become an unhandled rejection.
  try {
    await Promise.all([
      reconcileStalePendingMessages(services),
      // The chat path is cache-only, so warm tools off the startup critical path.
      services.mcp.prewarmActiveServers(),
    ]);
  } catch (error) {
    logger.error('Post-ready tasks failed', error as Error);
  }
}

/** Crash-orphaned assistant messages left `pending` from a previous run —
 * cold start is the only reliable "no writer is streaming into this" signal,
 * since the OS suspends rather than kills a backgrounded app. Best-effort:
 * a failure here shouldn't block the rest of startup. */
async function reconcileStalePendingMessages(services: DataServices) {
  try {
    const staleIds = await services.message.findPendingAssistantMessageIds();
    if (staleIds.length === 0) return;
    logger.info('Reconciling crash-orphaned pending assistant messages', {
      count: staleIds.length,
    });
    await services.message.settleCrashedMessages(staleIds);
  } catch (error) {
    logger.error('Failed to reconcile stale pending messages', error as Error);
  }
}

export function applyThemeModePreference(themeMode: ThemeMode) {
  switch (themeMode) {
    case ThemeMode.dark:
      Uniwind.setTheme('dark');
      break;
    case ThemeMode.light:
      Uniwind.setTheme('light');
      break;
    case ThemeMode.system:
      Uniwind.setTheme('system');
      break;
  }
}
