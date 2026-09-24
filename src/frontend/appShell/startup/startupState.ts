export const STARTUP_MINIMUM_VISIBLE_MS = 800;
export const STARTUP_CONTENT_TIMEOUT_MS = 3_000;
export const STARTUP_EXIT_LOGO_SCALE = 1.15;
export const STARTUP_EXIT_LOGO_DURATION_MS = 320;
export const STARTUP_EXIT_FADE_DELAY_MS = 60;
export const STARTUP_EXIT_FADE_DURATION_MS = 280;

type StartupExitState = {
  bootstrapReady: boolean;
  contentReady: boolean;
  minimumElapsed: boolean;
  timedOut: boolean;
};

export function isStartupReadyToExit({
  bootstrapReady,
  contentReady,
  minimumElapsed,
  timedOut,
}: StartupExitState) {
  return bootstrapReady && minimumElapsed && (contentReady || timedOut);
}

export function getStartupExitDurationMs(reducedMotion: boolean) {
  return reducedMotion ? 0 : STARTUP_EXIT_FADE_DELAY_MS + STARTUP_EXIT_FADE_DURATION_MS;
}

export function normalizeStartupColorScheme(
  colorScheme: string | null | undefined,
): 'dark' | 'light' {
  return colorScheme === 'dark' ? 'dark' : 'light';
}
