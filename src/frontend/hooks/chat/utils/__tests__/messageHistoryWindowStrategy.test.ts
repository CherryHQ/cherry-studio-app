import { getOlderLoadAction, shouldPrefetchOlderMessages } from '../messageHistoryWindowStrategy';

describe('message history window strategy', () => {
  test('reveals hidden messages before fetching older messages', () => {
    expect(getOlderLoadAction({ hasHiddenMessages: true, hiddenMessageCount: 4 })).toBe('reveal');
  });

  test('fetches older messages when no hidden messages remain', () => {
    expect(getOlderLoadAction({ hasHiddenMessages: false, hiddenMessageCount: 0 })).toBe('fetch');
  });

  test('prefetches older messages when the local hidden window is nearly exhausted', () => {
    expect(shouldPrefetchOlderMessages({ hasHiddenMessages: true, hiddenMessageCount: 4 })).toBe(
      true,
    );
  });

  test('does not prefetch older messages while enough hidden messages remain', () => {
    expect(shouldPrefetchOlderMessages({ hasHiddenMessages: true, hiddenMessageCount: 5 })).toBe(
      false,
    );
  });
});
