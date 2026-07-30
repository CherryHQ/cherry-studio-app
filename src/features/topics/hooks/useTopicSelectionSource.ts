import { useMemo } from 'react';

import type { SelectionSource } from '@/components/messageTabs';

import { useTopicListActions, useTopicListTopics } from '../context/TopicListProvider';

// Selection behavior the shared toolbar uses for the topics tab. Built from
// TopicListProvider data, so this must be called within that provider.
export function useTopicSelectionSource(): SelectionSource {
  const { topics } = useTopicListTopics();
  const { deleteTopics } = useTopicListActions();

  return useMemo(
    () => ({
      copy: {
        deleteFailed: 'topic.selection.deleteFailed',
        deleteMessage: 'topic.selection.deleteMessage',
        deleteTitle: 'topic.selection.deleteTitle',
      },
      deleteSelected: deleteTopics,
      getAllIds: () => topics.map((topic) => topic.id),
    }),
    [deleteTopics, topics],
  );
}
