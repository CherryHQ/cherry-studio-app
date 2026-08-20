import {
  getStartupExitDurationMs,
  isStartupReadyToExit,
  normalizeStartupColorScheme,
  STARTUP_ATTRIBUTION_ENTER_DURATION_MS,
  STARTUP_EXIT_DURATION_MS,
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
      attributionEnter: STARTUP_ATTRIBUTION_ENTER_DURATION_MS,
      coverExit: STARTUP_EXIT_DURATION_MS,
      minimumVisible: STARTUP_MINIMUM_VISIBLE_MS,
    }).toEqual({ attributionEnter: 260, coverExit: 220, minimumVisible: 800 });
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
    expect(getStartupExitDurationMs(false)).toBe(STARTUP_EXIT_DURATION_MS);
  });

  test('uses dark only for an explicit system dark appearance', () => {
    expect(normalizeStartupColorScheme('dark')).toBe('dark');
    expect(normalizeStartupColorScheme('light')).toBe('light');
    expect(normalizeStartupColorScheme('unspecified')).toBe('light');
    expect(normalizeStartupColorScheme(null)).toBe('light');
  });
});
