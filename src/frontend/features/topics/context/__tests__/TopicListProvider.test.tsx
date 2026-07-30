import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { BackendProvider, queryKeys } from '@/frontend/data';
import { usePins, useTopics } from '@/frontend/hooks/chat';
import { prefetchTopicMessages } from '@/frontend/hooks/chat/utils/messageQueryOptions';
import type { MobileBackend } from '@/shared/contracts';
import type { Topic } from '@/shared/data/types/topic';

import { TopicListProvider, useTopicListActions } from '../TopicListProvider';

const mockRouterPush = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockPrefetchQuery = jest.fn(async (_options: unknown) => undefined);
const mockRemoveQueries = jest.fn();
const mockQueryClient = {
  invalidateQueries: mockInvalidateQueries,
  prefetchQuery: mockPrefetchQuery,
  removeQueries: mockRemoveQueries,
};
const defaultModelId = 'provider::default-model';
const mockGetCachedPreferenceValue = jest.fn((): string | null => defaultModelId);
const mockGetModelById = jest.fn(async (_modelId: string) => null);
const mockChat = {} as MobileBackend['chat'];
const mockBackend = {
  chat: mockChat,
  models: {
    get: mockGetModelById,
  },
  preferences: {
    readCached: mockGetCachedPreferenceValue,
  },
  topics: {
    removeMany: jest.fn(),
    update: jest.fn(),
  },
} as unknown as MobileBackend;

jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn(),
  useQueryClient: () => mockQueryClient,
}));

jest.mock('@/frontend/hooks/chat', () => ({
  usePins: jest.fn(),
  useTopics: jest.fn(),
}));

jest.mock('@/frontend/hooks/chat/utils/messageQueryOptions', () => ({
  prefetchTopicMessages: jest.fn(async () => undefined),
}));

const useMutationMock = jest.requireMock<{ useMutation: jest.Mock }>(
  '@tanstack/react-query',
).useMutation;
const usePinsMock = usePins as jest.MockedFunction<typeof usePins>;
const useTopicsMock = useTopics as jest.MockedFunction<typeof useTopics>;
const prefetchTopicMessagesMock = prefetchTopicMessages as jest.MockedFunction<
  typeof prefetchTopicMessages
>;
const mockRenameTopic = jest.fn(async () => undefined);
const mockDeleteTopics = jest.fn(async () => undefined);
const mockLoadMoreTopics = jest.fn(async () => undefined);
const mockTogglePin = jest.fn(async () => undefined);

let mutationHookIndex = 0;
let currentActions: ReturnType<typeof useTopicListActions> | undefined;
let renderer: ReactTestRenderer | undefined;

function TopicListProbe() {
  const actions = useTopicListActions();

  useEffect(() => {
    currentActions = actions;
  }, [actions]);

  return null;
}

function makeTopic(index: number): Topic {
  return { id: `topic-${index}`, name: `Topic ${index}` } as Topic;
}

beforeEach(() => {
  jest.clearAllMocks();
  currentActions = undefined;
  mutationHookIndex = 0;
  renderer = undefined;
  mockGetCachedPreferenceValue.mockReturnValue(defaultModelId);

  usePinsMock.mockReturnValue({
    error: null,
    isLoading: false,
    isMutating: false,
    isRefreshing: false,
    pinnedIds: ['topic-1'],
    pins: [],
    pinsQuery: {} as ReturnType<typeof usePins>['pinsQuery'],
    refetch: jest.fn(),
    togglePin: mockTogglePin,
  });

  useMutationMock.mockImplementation(() => {
    const mutateAsync = mutationHookIndex % 2 === 0 ? mockRenameTopic : mockDeleteTopics;
    mutationHookIndex += 1;
    return { mutateAsync };
  });
});

afterEach(async () => {
  await act(async () => {
    renderer?.unmount();
  });
});

async function renderProvider(topics: readonly Topic[]) {
  useTopicsMock.mockImplementation(() => ({
    isLoadingInitial: false,
    loadMore: mockLoadMoreTopics,
    topics,
  }));

  await act(async () => {
    renderer = create(
      <BackendProvider backend={mockBackend}>
        <TopicListProvider>
          <TopicListProbe />
        </TopicListProvider>
      </BackendProvider>,
    );
  });
}

describe('TopicListProvider', () => {
  test('prefetches the focused topic window and pushes a selected topic', async () => {
    const topics = Array.from({ length: 14 }, (_, index) => makeTopic(index + 1));
    await renderProvider(topics);

    expect(mockPrefetchQuery).toHaveBeenCalledTimes(1);
    expect(mockPrefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: queryKeys.models.detail(defaultModelId),
        staleTime: 1000 * 60 * 5,
      }),
    );
    expect(mockPrefetchQuery.mock.invocationCallOrder[0]).toBeLessThan(
      prefetchTopicMessagesMock.mock.invocationCallOrder[0],
    );

    const modelQueryFn = (
      mockPrefetchQuery.mock.calls[0]?.[0] as { queryFn: () => Promise<unknown> }
    ).queryFn;
    await expect(modelQueryFn()).resolves.toBeNull();
    expect(mockGetModelById).toHaveBeenCalledWith(defaultModelId);

    expect(prefetchTopicMessagesMock).toHaveBeenCalledTimes(12);
    expect(prefetchTopicMessagesMock).not.toHaveBeenCalledWith(
      mockQueryClient,
      mockChat,
      'topic-13',
    );

    await act(async () => {
      currentActions?.openTopic('topic-13');
    });

    expect(mockPrefetchQuery).toHaveBeenCalledTimes(2);
    expect(prefetchTopicMessagesMock).toHaveBeenCalledWith(mockQueryClient, mockChat, 'topic-13');
    expect(mockRouterPush).toHaveBeenCalledWith({
      params: { topicId: 'topic-13' },
      pathname: '/topics',
    });
  });

  test.each([null, 'legacy-model-id'])('skips default model prefetch for %p', async (modelId) => {
    mockGetCachedPreferenceValue.mockReturnValue(modelId);

    await renderProvider([makeTopic(1)]);

    expect(mockPrefetchQuery).not.toHaveBeenCalled();
  });

  test('passes pagination through while preserving topic mutations', async () => {
    const observedQueries: string[] = [];
    useTopicsMock.mockImplementation(({ q }) => {
      observedQueries.push(q);
      return {
        isLoadingInitial: false,
        loadMore: mockLoadMoreTopics,
        topics: [],
      };
    });

    await act(async () => {
      renderer = create(
        <BackendProvider backend={mockBackend}>
          <TopicListProvider>
            <TopicListProbe />
          </TopicListProvider>
        </BackendProvider>,
      );
    });
    await act(async () => {
      currentActions?.loadMoreTopics();
    });

    expect(observedQueries).toContain('');
    expect(mockLoadMoreTopics).toHaveBeenCalledTimes(1);

    await act(async () => {
      await currentActions?.renameTopic('topic-1', '  Renamed  ');
      await currentActions?.renameTopic('topic-1', '   ');
      await currentActions?.deleteTopic('topic-2');
      await currentActions?.deleteTopics(['topic-3', 'topic-4', 'topic-3']);
    });

    expect(mockRenameTopic).toHaveBeenCalledTimes(1);
    expect(mockRenameTopic).toHaveBeenCalledWith({ id: 'topic-1', name: 'Renamed' });
    expect(mockDeleteTopics).toHaveBeenNthCalledWith(1, ['topic-2']);
    expect(mockDeleteTopics).toHaveBeenNthCalledWith(2, ['topic-3', 'topic-4']);
  });

  test('toggles a topic pin and refreshes the ordered topic list', async () => {
    await renderProvider([makeTopic(1)]);

    await act(async () => {
      await currentActions?.toggleTopicPin('topic-1');
    });

    expect(mockTogglePin).toHaveBeenCalledWith('topic-1');
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['/topics'] });
  });
});
