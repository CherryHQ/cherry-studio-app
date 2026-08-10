import type { ApiClient, CursorPaginationResponse } from '@cherrystudio/universal/data/api/types';
import type { Topic } from '@cherrystudio/universal/data/types/topic';
import { type InfiniteData, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiProvider } from '@/frontend/data/DataApiProvider';

import { TopicListProvider, useTopicListActions } from '../TopicListProvider';

const pendingDelete = deferred<void>();
const dataApi = {
  delete: jest.fn(() => pendingDelete.promise),
  get: jest.fn(),
  patch: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
} as unknown as ApiClient;

let actions: ReturnType<typeof useTopicListActions> | undefined;
let queryClient: QueryClient;
let renderer: ReactTestRenderer | undefined;

jest.mock('expo-router', () => ({
  useIsFocused: () => false,
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/frontend/data', () => ({
  ...jest.requireActual('@/frontend/data'),
  usePreference: () => [null, jest.fn()],
  usePrefetch: () => jest.fn(),
  usePrefetchInfiniteQuery: () => jest.fn(),
}));

jest.mock('@/frontend/hooks/chat', () => ({
  usePins: () => ({
    isLoading: false,
    isMutating: false,
    isRefreshing: false,
    pinnedIds: [],
    togglePin: jest.fn(),
  }),
  useTopics: () => ({ isLoadingInitial: false, loadMore: jest.fn(), topics: [] }),
}));

function Probe() {
  const currentActions = useTopicListActions();

  useEffect(() => {
    actions = currentActions;
  }, [currentActions]);

  return null;
}

describe('TopicListProvider optimistic deletion', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    actions = undefined;
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { gcTime: Infinity, retry: false } },
    });
    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <DataApiProvider dataApi={dataApi}>
            <TopicListProvider>
              <Probe />
            </TopicListProvider>
          </DataApiProvider>
        </QueryClientProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    queryClient.clear();
  });

  it('removes a topic while pending and restores it before rejecting', async () => {
    const queryKey = ['/topics', { limit: 50, q: undefined }] as const;
    const topics = [makeTopic('a'), makeTopic('b')];
    queryClient.setQueryData<InfiniteData<CursorPaginationResponse<Topic>, string | undefined>>(
      queryKey,
      { pageParams: [undefined], pages: [{ items: topics }] },
    );

    let deletion: Promise<void> | undefined;
    await act(async () => {
      deletion = actions?.deleteTopic('a');
      await Promise.resolve();
    });
    expect(readTopicIds(queryKey)).toEqual(['b']);

    pendingDelete.reject(new Error('delete failed'));
    await act(async () => {
      await expect(deletion).rejects.toThrow('delete failed');
    });

    expect(readTopicIds(queryKey)).toEqual(['a', 'b']);
  });
});

function readTopicIds(queryKey: readonly unknown[]) {
  const data = queryClient.getQueryData<InfiniteData<CursorPaginationResponse<Topic>>>(queryKey);
  return data?.pages.flatMap((page) => page.items.map((topic) => topic.id)) ?? [];
}

function makeTopic(id: string): Topic {
  return { id, name: id.toUpperCase() } as Topic;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}
