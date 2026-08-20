import { useState } from 'react';

export type TopicListQuery = {
  error?: Error;
  isLoading: boolean;
};

type TopicListInitialDataOptions = {
  assistants: TopicListQuery;
  topics: TopicListQuery;
};

export function areTopicListQueriesSettled({ assistants, topics }: TopicListInitialDataOptions) {
  return !assistants.isLoading && !topics.isLoading;
}

/**
 * Latches once every initial query has settled (success, empty, or error) so
 * the list mounts exactly once and never unmounts on a later refetch.
 */
export function useTopicListInitialData(options: TopicListInitialDataOptions) {
  const queriesSettled = areTopicListQueriesSettled(options);
  const [hasInitialQueriesSettled, setHasInitialQueriesSettled] = useState(queriesSettled);

  if (queriesSettled && !hasInitialQueriesSettled) {
    setHasInitialQueriesSettled(true);
  }

  return hasInitialQueriesSettled || queriesSettled;
}
