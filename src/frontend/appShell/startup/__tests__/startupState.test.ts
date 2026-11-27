import { isStartupReadyToExit, STARTUP_CONTENT_TIMEOUT_MS } from '../startupState';

const readyState = {
  bootstrapReady: true,
  contentReady: true,
  timedOut: false,
};

describe('startup state', () => {
  test('uses the three-second content readiness fallback timeout', () => {
    expect(STARTUP_CONTENT_TIMEOUT_MS).toBe(3_000);
  });

  test.each([
    ['bootstrap', { bootstrapReady: false }],
    ['content', { contentReady: false }],
  ])('does not exit before %s is ready', (_condition, override) => {
    expect(isStartupReadyToExit({ ...readyState, ...override })).toBe(false);
  });

  test('exits when bootstrap and initial content are ready', () => {
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
});
