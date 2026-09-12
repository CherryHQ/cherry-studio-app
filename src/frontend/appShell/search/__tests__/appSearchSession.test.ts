import {
  APP_SEARCH_SETTLE_DELAY_MS,
  APP_SEARCH_TRANSITION_DURATION_MS,
  cancelScheduledAppSearchFinish,
  createAppSearchSession,
  finishAppSearchSession,
  scheduleAppSearchFinish,
  selectAppSearchItem,
} from '../appSearchSession';
import type { AppSearchOutcome } from '../types';

describe('app search session lifecycle', () => {
  let sessionId: string | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    if (sessionId) {
      finishAppSearchSession(sessionId);
    }
    sessionId = undefined;
    jest.useRealTimers();
  });

  test('resolves a programmatic pop only after the native transition duration', async () => {
    const session = createAppSearchSession({
      emptyText: 'Empty',
      getAccessibilityLabel: (item: string) => item,
      keyExtractor: (item: string) => item,
      placeholder: 'Search',
      renderItem: (item: string) => item,
      search: () => ({ groups: [] }),
    });
    const createdSessionId = session.sessionId;
    if (!createdSessionId) {
      throw new Error('Expected an app search session');
    }
    sessionId = createdSessionId;

    let outcome: AppSearchOutcome<string> | undefined;
    void session.outcome.then((value) => {
      outcome = value;
    });
    selectAppSearchItem(createdSessionId, 'model-a');
    scheduleAppSearchFinish(createdSessionId);

    jest.advanceTimersByTime(APP_SEARCH_TRANSITION_DURATION_MS);
    await Promise.resolve();
    expect(outcome).toBeUndefined();

    jest.advanceTimersByTime(APP_SEARCH_SETTLE_DELAY_MS - APP_SEARCH_TRANSITION_DURATION_MS);
    await expect(session.outcome).resolves.toEqual({ item: 'model-a', type: 'selected' });
  });

  test('cancels a cleanup fallback when the route effect is set up again', async () => {
    const session = createAppSearchSession({
      emptyText: 'Empty',
      getAccessibilityLabel: (item: string) => item,
      keyExtractor: (item: string) => item,
      placeholder: 'Search',
      renderItem: (item: string) => item,
      search: () => ({ groups: [] }),
    });
    const createdSessionId = session.sessionId;
    if (!createdSessionId) {
      throw new Error('Expected an app search session');
    }
    sessionId = createdSessionId;

    let isSettled = false;
    void session.outcome.then(() => {
      isSettled = true;
    });
    scheduleAppSearchFinish(createdSessionId);
    cancelScheduledAppSearchFinish(createdSessionId);
    jest.advanceTimersByTime(APP_SEARCH_SETTLE_DELAY_MS);
    await Promise.resolve();

    expect(isSettled).toBe(false);
  });
});
