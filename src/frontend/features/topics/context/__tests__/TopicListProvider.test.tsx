import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { usePins, useTopics } from '@/frontend/hooks/chat';
import type { Topic } from '@/shared/data/types/topic';

import { TopicListProvider, useTopicListActions } from '../TopicListProvider';

const mockRouterPush = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockPrefetch = jest.fn(async (_path: string, _options?: unknown) => undefined);
const mockPrefetchInfinite = jest.fn(async (_path: string, _options?: unknown) => undefined);
const mockRemoveQueries = jest.fn();
const mockQueryClient = {
  invalidateQueries: mockInvalidateQueries,
  removeQueries: mockRemoveQueries,
};
const defaultModelId = 'provider::default-model';
const mockGetCachedPreferenceValue = jest.fn((): string | null => defaultModelId);
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

jest.mock('@/frontend/data', () => ({
  ...jest.requireActual('@/frontend/data'),
  useMutation: jest.fn(),
  usePrefetch: () => mockPrefetch,
  usePrefetchInfiniteQuery: () => mockPrefetchInfinite,
  usePreference: () => [mockGetCachedPreferenceValue(), jest.fn()],
}));

jest.mock('@/frontend/hooks/chat', () => ({
  usePins: jest.fn(),
  useTopics: jest.fn(),
}));

jest.mock('@/frontend/hooks/chat/utils/messageQueryOptions', () => ({
  getMessagesQueryKey: (topicId: string) => [`/topics/${topicId}/messages`],
  initialMessagesPageSize: 12,
}));

const useMutationMock = jest.requireMock<{ useMutation: jest.Mock }>('@/frontend/data').useMutation;
const usePinsMock = usePins as jest.MockedFunction<typeof usePins>;
const useTopicsMock = useTopics as jest.MockedFunction<typeof useTopics>;
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
    error: undefined,
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
    const trigger = mutationHookIndex % 2 === 0 ? mockRenameTopic : mockDeleteTopics;
    mutationHookIndex += 1;
    return { trigger };
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
      <TopicListProvider>
        <TopicListProbe />
      </TopicListProvider>,
    );
  });
}

describe('TopicListProvider', () => {
  test('prefetches the focused topic window and pushes a selected topic', async () => {
    const topics = Array.from({ length: 14 }, (_, index) => makeTopic(index + 1));
    await renderProvider(topics);

    expect(mockPrefetch).toHaveBeenCalledTimes(1);
    expect(mockPrefetch).toHaveBeenCalledWith('/models/:uniqueModelId*', {
      params: { uniqueModelId: defaultModelId },
      staleTime: 1000 * 60 * 5,
    });
    expect(mockPrefetch.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrefetchInfinite.mock.invocationCallOrder[0],
    );

    expect(mockPrefetchInfinite).toHaveBeenCalledTimes(12);
    expect(mockPrefetchInfinite).not.toHaveBeenCalledWith(
      '/topics/:topicId/messages',
      expect.objectContaining({ params: { topicId: 'topic-13' } }),
    );

    await act(async () => {
      currentActions?.openTopic('topic-13');
    });

    expect(mockPrefetch).toHaveBeenCalledTimes(2);
    expect(mockPrefetchInfinite).toHaveBeenCalledWith('/topics/:topicId/messages', {
      limit: 12,
      params: { topicId: 'topic-13' },
      staleTime: 30_000,
    });
    expect(mockRouterPush).toHaveBeenCalledWith({
      params: { topicId: 'topic-13' },
      pathname: '/topics',
    });
  });

  test.each([null, 'legacy-model-id'])('skips default model prefetch for %p', async (modelId) => {
    mockGetCachedPreferenceValue.mockReturnValue(modelId);

    await renderProvider([makeTopic(1)]);

    expect(mockPrefetch).not.toHaveBeenCalled();
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
        <TopicListProvider>
          <TopicListProbe />
        </TopicListProvider>,
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
    expect(mockRenameTopic).toHaveBeenCalledWith({
      body: { isNameManuallyEdited: true, name: 'Renamed' },
      params: { id: 'topic-1' },
    });
    expect(mockDeleteTopics).toHaveBeenNthCalledWith(1, { query: { ids: ['topic-2'] } });
    expect(mockDeleteTopics).toHaveBeenNthCalledWith(2, {
      query: { ids: ['topic-3', 'topic-4'] },
    });
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
