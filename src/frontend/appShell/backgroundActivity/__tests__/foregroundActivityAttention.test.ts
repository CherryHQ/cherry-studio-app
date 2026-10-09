import {
  isBackgroundTaskVisible,
  registerVisibleBackgroundTask,
  subscribeVisibleBackgroundTask,
} from '../foregroundActivityAttention';

jest.mock('expo-linking', () => ({ resolveScheme: () => 'cherrystudio' }));

test('an outgoing screen cannot clear visibility registered by the next screen', () => {
  const first = { kind: 'chat', sessionId: 'first' } as const;
  const second = { kind: 'painting', paintingId: 'second' } as const;
  const releaseFirst = registerVisibleBackgroundTask(first);
  const releaseSecond = registerVisibleBackgroundTask(second);
  releaseFirst();
  expect(isBackgroundTaskVisible(first)).toBe(false);
  expect(isBackgroundTaskVisible(second)).toBe(true);
  releaseSecond();
  expect(isBackgroundTaskVisible(second)).toBe(false);
});

test('reports the visible task as the deep link both layers already share', () => {
  const published: (string | undefined)[] = [];
  const unsubscribe = subscribeVisibleBackgroundTask((url) => published.push(url));

  registerVisibleBackgroundTask({ kind: 'chat', sessionId: 'session-1' })();
  unsubscribe();
  registerVisibleBackgroundTask({ kind: 'painting', paintingId: 'painting-1' })();

  expect(published).toEqual(['cherrystudio:///?sessionId=session-1', undefined]);
});
