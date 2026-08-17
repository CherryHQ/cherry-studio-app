import { useState } from 'react';

import { useStartupReadyAfterFrames } from '@/frontend/components/startup/useStartupReadyAfterFrames';

export type TopicListStartupQuery = {
  error?: Error;
  isLoading: boolean;
};

type TopicListStartupReadinessOptions = {
  assistants: TopicListStartupQuery;
  pins: TopicListStartupQuery;
  topics: TopicListStartupQuery;
};

export function areTopicListStartupQueriesSettled({
  assistants,
  pins,
  topics,
}: TopicListStartupReadinessOptions) {
  return !assistants.isLoading && !pins.isLoading && !topics.isLoading;
}

export function useTopicListStartupReadiness(options: TopicListStartupReadinessOptions) {
  const queriesSettled = areTopicListStartupQueriesSettled(options);
  const [hasInitialQueriesSettled, setHasInitialQueriesSettled] = useState(queriesSettled);
  const reportListReadyAfterFrames = useStartupReadyAfterFrames();

  if (queriesSettled && !hasInitialQueriesSettled) {
    setHasInitialQueriesSettled(true);
  }

  return {
    handleListLoad: reportListReadyAfterFrames,
    isInitialDataSettled: hasInitialQueriesSettled || queriesSettled,
  };
}
