import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { queryKeys } from '@/data/api';
import type { Topic } from '@/shared/domain/topic';

export function useHydrateTopicDetails(topics: readonly Topic[]) {
  const queryClient = useQueryClient();

  useEffect(() => {
    for (const topic of topics) {
      queryClient.setQueryData(queryKeys.topics.detail(topic.id), topic);
    }
  }, [queryClient, topics]);
}
