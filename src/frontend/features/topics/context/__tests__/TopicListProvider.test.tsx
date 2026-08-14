import type { TopicListItem } from '@cherrystudio/universal/data/api/schemas/topics';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { usePins, useTopics } from '@/frontend/hooks/chat';

import { TopicListProvider, useTopicListActions } from '../TopicListProvider';

const mockInvalidateQueries = jest.fn();
const mockCancelQueries = jest.fn(async () => undefined);
const mockGetQueriesData = jest.fn();
const mockRemoveQueries = jest.fn();
const mockSetQueriesData = jest.fn();
const mockSetQueryData = jest.fn();
const mockQueryClient = {
  cancelQueries: mockCancelQueries,
  getQueriesData: mockGetQueriesData,
  invalidateQueries: mockInvalidateQueries,
  removeQueries: mockRemoveQueries,
  setQueriesData: mockSetQueriesData,
  setQueryData: mockSetQueryData,
};
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

jest.mock('@/frontend/data', () => ({
  ...jest.requireActual('@/frontend/data'),
  useMutation: jest.fn(),
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
let renameMutationOptions:
  | {
      onError?: (error: Error, variables: unknown, context: Record<string, unknown>) => void;
      onMutate?: (variables: {
        body: { isNameManuallyEdited: true; name: string };
        params: { id: string };
      }) => Promise<Record<string, unknown>>;
    }
  | undefined;
let currentActions: ReturnType<typeof useTopicListActions> | undefined;
let renderer: ReactTestRenderer | undefined;

function TopicListProbe() {
  const actions = useTopicListActions();

  useEffect(() => {
    currentActions = actions;
  }, [actions]);

  return null;
}

function makeTopic(index: number): TopicListItem {
  return { id: `topic-${index}`, latestMessageText: '', name: `Topic ${index}` } as TopicListItem;
}

beforeEach(() => {
  jest.clearAllMocks();
  currentActions = undefined;
  mutationHookIndex = 0;
  renameMutationOptions = undefined;
  renderer = undefined;

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

  useMutationMock.mockImplementation((_method, _path, options) => {
    const isRenameMutation = mutationHookIndex % 2 === 0;
    const trigger = isRenameMutation ? mockRenameTopic : mockDeleteTopics;
    if (isRenameMutation) {
      renameMutationOptions = options;
    }
    mutationHookIndex += 1;
    return { trigger };
  });
});

afterEach(async () => {
  await act(async () => {
    renderer?.unmount();
  });
});

async function renderProvider(topics: readonly TopicListItem[]) {
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

  test('optimistically renames list and detail caches and restores both on failure', async () => {
    const originalTopic = makeTopic(1);
    const originalList = {
      pageParams: [undefined],
      pages: [{ items: [originalTopic], nextCursor: undefined }],
    };
    const updatedCaches: unknown[] = [];
    mockGetQueriesData
      .mockReturnValueOnce([[['/topics'], originalList]])
      .mockReturnValueOnce([[['/topics/topic-1'], originalTopic]]);
    mockSetQueriesData
      .mockImplementationOnce((_filters, update) => updatedCaches.push(update(originalList)))
      .mockImplementationOnce((_filters, update) => updatedCaches.push(update(originalTopic)));

    await renderProvider([originalTopic]);
    const variables = {
      body: { isNameManuallyEdited: true as const, name: 'Renamed topic' },
      params: { id: 'topic-1' },
    };
    const context = await renameMutationOptions?.onMutate?.(variables);

    expect(updatedCaches).toEqual([
      expect.objectContaining({
        pages: [
          expect.objectContaining({
            items: [
              expect.objectContaining({
                id: 'topic-1',
                isNameManuallyEdited: true,
                name: 'Renamed topic',
              }),
            ],
          }),
        ],
      }),
      expect.objectContaining({
        id: 'topic-1',
        isNameManuallyEdited: true,
        name: 'Renamed topic',
      }),
    ]);

    renameMutationOptions?.onError?.(new Error('rename failed'), variables, context ?? {});
    expect(mockSetQueryData).toHaveBeenCalledWith(['/topics'], originalList);
    expect(mockSetQueryData).toHaveBeenCalledWith(['/topics/topic-1'], originalTopic);
  });
});
