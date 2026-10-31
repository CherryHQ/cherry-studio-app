import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PROVIDER_LIST_PAGE_SIZE, PROVIDER_LIST_STALE_TIME } from '../../providerListQuery';
import { useProviderListNavigation } from '../useProviderListNavigation';

const mockRouter = { prefetch: jest.fn(), push: jest.fn() };
const mockPrefetchInfiniteQuery = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/frontend/data/hooks', () => ({
  usePrefetchInfiniteQuery: () => mockPrefetchInfiniteQuery,
}));

describe('provider list navigation', () => {
  let renderer: ReactTestRenderer;
  let navigation: ReturnType<typeof useProviderListNavigation>;

  function Probe() {
    navigation = useProviderListNavigation();
    return null;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrefetchInfiniteQuery.mockResolvedValue(undefined);
    act(() => {
      renderer = create(<Probe />);
    });
  });

  afterEach(() => {
    act(() => renderer.unmount());
  });

  it('warms provider data on press-in without preloading or opening a route', () => {
    act(() => navigation.prepareProviderList());

    expect(mockPrefetchInfiniteQuery).toHaveBeenCalledWith('/providers/page', {
      limit: PROVIDER_LIST_PAGE_SIZE,
      staleTime: PROVIDER_LIST_STALE_TIME,
    });
    expect(mockRouter.prefetch).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('pushes once on press without waiting for data or preloading the native screen', () => {
    mockPrefetchInfiniteQuery.mockReturnValue(new Promise(() => undefined));

    act(() => {
      navigation.prepareProviderList();
      navigation.openProviderList();
    });

    expect(mockRouter.prefetch).not.toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/provider');
  });
});
