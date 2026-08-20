import { useMemo } from 'react';

import { type SelectionSource, usePendingDeletionIds } from '@/frontend/components/selection';

import { useTopicListActions, useTopicListTopics } from '../context/TopicListProvider';

// Selection behavior the shared toolbar uses for the topic list. Built from
// TopicListProvider data, so this must be called within that provider.
export function useTopicSelectionSource(): SelectionSource {
  const { topics } = useTopicListTopics();
  const { deleteTopics } = useTopicListActions();
  const pendingDeletionIds = usePendingDeletionIds('conversations');

  return useMemo(
    () => ({
      copy: {
        deleteFailed: 'topic.selection.deleteFailed',
        deleteMessage: 'topic.selection.deleteMessage',
        deleteTitle: 'topic.selection.deleteTitle',
      },
      deleteSelected: deleteTopics,
      getAllIds: () =>
        topics.filter((topic) => !pendingDeletionIds.has(topic.id)).map((topic) => topic.id),
    }),
    [deleteTopics, pendingDeletionIds, topics],
  );
}
