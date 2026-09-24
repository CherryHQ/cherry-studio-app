import {
  getStartupExitDurationMs,
  isStartupReadyToExit,
  normalizeStartupColorScheme,
  STARTUP_EXIT_FADE_DELAY_MS,
  STARTUP_EXIT_FADE_DURATION_MS,
  STARTUP_EXIT_LOGO_DURATION_MS,
  STARTUP_EXIT_LOGO_SCALE,
  STARTUP_MINIMUM_VISIBLE_MS,
} from '../startupState';

const readyState = {
  bootstrapReady: true,
  contentReady: true,
  minimumElapsed: true,
  timedOut: false,
};

describe('startup state', () => {
  test('uses the calibrated startup motion timeline', () => {
    expect({
      exitFadeDelay: STARTUP_EXIT_FADE_DELAY_MS,
      exitFadeDuration: STARTUP_EXIT_FADE_DURATION_MS,
      exitLogoDuration: STARTUP_EXIT_LOGO_DURATION_MS,
      exitLogoScale: STARTUP_EXIT_LOGO_SCALE,
      minimumVisible: STARTUP_MINIMUM_VISIBLE_MS,
    }).toEqual({
      exitFadeDelay: 60,
      exitFadeDuration: 280,
      exitLogoDuration: 320,
      exitLogoScale: 1.15,
      minimumVisible: 800,
    });
  });

  test.each([
    ['bootstrap', { bootstrapReady: false }],
    ['content', { contentReady: false }],
    ['minimum duration', { minimumElapsed: false }],
  ])('does not exit before %s is ready', (_condition, override) => {
    expect(isStartupReadyToExit({ ...readyState, ...override })).toBe(false);
  });

  test('exits when all three product conditions are met', () => {
    expect(isStartupReadyToExit(readyState)).toBe(true);
  });

  test('allows the content timeout to replace only the content signal', () => {
    expect(isStartupReadyToExit({ ...readyState, contentReady: false, timedOut: true })).toBe(true);
    expect(
      isStartupReadyToExit({
        ...readyState,
        bootstrapReady: false,
        contentReady: false,
        timedOut: true,
      }),
    ).toBe(false);
  });

  test('removes the exit animation when Reduce Motion is enabled', () => {
    expect(getStartupExitDurationMs(true)).toBe(0);
    expect(getStartupExitDurationMs(false)).toBe(
      STARTUP_EXIT_FADE_DELAY_MS + STARTUP_EXIT_FADE_DURATION_MS,
    );
  });

  test('uses dark only for an explicit system dark appearance', () => {
    expect(normalizeStartupColorScheme('dark')).toBe('dark');
    expect(normalizeStartupColorScheme('light')).toBe('light');
    expect(normalizeStartupColorScheme('unspecified')).toBe('light');
    expect(normalizeStartupColorScheme(null)).toBe('light');
  });
});
