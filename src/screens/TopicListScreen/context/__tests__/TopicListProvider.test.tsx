import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useDataMutation } from '@/data/hooks';
import type { DataServices } from '@/data/services/createDataServices';
import type { Topic } from '@/data/types/topic';
import { useTopics } from '@/hooks/chat';
import { prefetchTopicMessages } from '@/hooks/chat/utils/messageQueryOptions';

import { TopicListProvider, useTopicListActions } from '../TopicListProvider';

const mockRouterPush = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockRemoveQueries = jest.fn();
const mockQueryClient = {
  invalidateQueries: mockInvalidateQueries,
  removeQueries: mockRemoveQueries,
};
const mockServices = {
  topic: {
    deleteMany: jest.fn(),
    update: jest.fn(),
  },
} as unknown as DataServices;

jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

jest.mock('@/data/hooks', () => ({
  useDataMutation: jest.fn(),
}));

jest.mock('@/data/runtime', () => ({
  useDataServices: () => mockServices,
}));

jest.mock('@/hooks/chat', () => ({
  useTopics: jest.fn(),
}));

jest.mock('@/hooks/chat/utils/messageQueryOptions', () => ({
  prefetchTopicMessages: jest.fn(async () => undefined),
}));

const useDataMutationMock = useDataMutation as jest.Mock;
const useTopicsMock = useTopics as jest.MockedFunction<typeof useTopics>;
const prefetchTopicMessagesMock = prefetchTopicMessages as jest.MockedFunction<
  typeof prefetchTopicMessages
>;
const mockRenameTopic = jest.fn(async () => undefined);
const mockDeleteTopics = jest.fn(async () => undefined);
const mockLoadMoreTopics = jest.fn(async () => undefined);

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

  useDataMutationMock.mockImplementation(() => {
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

    expect(prefetchTopicMessagesMock).toHaveBeenCalledTimes(12);
    expect(prefetchTopicMessagesMock).not.toHaveBeenCalledWith(
      mockQueryClient,
      mockServices,
      'topic-13',
    );

    await act(async () => {
      currentActions?.openTopic('topic-13');
    });

    expect(prefetchTopicMessagesMock).toHaveBeenCalledWith(
      mockQueryClient,
      mockServices,
      'topic-13',
    );
    expect(mockRouterPush).toHaveBeenCalledWith({
      params: { topicId: 'topic-13' },
      pathname: '/topics',
    });
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
    expect(mockRenameTopic).toHaveBeenCalledWith({ id: 'topic-1', name: 'Renamed' });
    expect(mockDeleteTopics).toHaveBeenNthCalledWith(1, ['topic-2']);
    expect(mockDeleteTopics).toHaveBeenNthCalledWith(2, ['topic-3', 'topic-4']);
  });

  test('pushes the topic-less route for a new chat', async () => {
    await renderProvider([]);

    await act(async () => {
      currentActions?.openNewTopic();
    });

    expect(mockRouterPush).toHaveBeenCalledWith('/topics');
  });

  test('pushes the blank painting route from the create menu', async () => {
    await renderProvider([]);

    await act(async () => {
      currentActions?.openNewPainting();
    });

    expect(mockRouterPush).toHaveBeenCalledWith('/paintings');
  });
});
