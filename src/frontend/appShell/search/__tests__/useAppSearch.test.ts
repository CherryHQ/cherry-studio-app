import { router } from 'expo-router';

import { finishAppSearchSession } from '../appSearchSession';
import { useAppSearch } from '../useAppSearch';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

describe('useAppSearch', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('uses an app-search-specific route parameter', async () => {
    const outcome = useAppSearch().open({
      emptyText: 'Empty',
      getAccessibilityLabel: (item: string) => item,
      keyExtractor: (item: string) => item,
      placeholder: 'Search',
      renderItem: (item: string) => item,
      search: () => ({ groups: [] }),
    });

    expect(router.push).toHaveBeenCalledWith({
      params: { searchSessionId: expect.any(String) },
      pathname: '/search',
    });

    const searchSessionId = (
      jest.mocked(router.push).mock.calls[0]?.[0] as {
        params?: { searchSessionId?: string };
      }
    ).params?.searchSessionId;
    if (!searchSessionId) {
      throw new Error('Expected an app-search session id');
    }
    finishAppSearchSession(searchSessionId);
    await expect(outcome).resolves.toEqual({ type: 'cancelled' });
  });
});
