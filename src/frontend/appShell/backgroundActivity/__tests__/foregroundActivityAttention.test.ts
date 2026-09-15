import {
  isBackgroundTaskVisible,
  registerVisibleBackgroundTask,
} from '../foregroundActivityAttention';

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
