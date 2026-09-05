import { getOlderLoadAction } from '../messageHistoryWindowStrategy';

describe('message history window strategy', () => {
  test('reveals hidden messages before fetching older messages', () => {
    expect(getOlderLoadAction({ hasHiddenMessages: true, hiddenMessageCount: 4 })).toBe('reveal');
  });

  test('fetches older messages when no hidden messages remain', () => {
    expect(getOlderLoadAction({ hasHiddenMessages: false, hiddenMessageCount: 0 })).toBe('fetch');
  });
});
