import { useEffect } from 'react';

import { useInfiniteQuery } from '@/frontend/data';
import { AI_USAGE_RECORD_MAX_LIMIT } from '@/shared/data/api/schemas/aiUsageRecords';

/** Mounted only while a message's detail sheet is open. */
export function useMessageUsageRecords(messageId: string) {
  const query = useInfiniteQuery('/ai-usage-records', {
    limit: AI_USAGE_RECORD_MAX_LIMIT,
    query: { messageId, messageKind: 'agent-session', sortOrder: 'asc' },
  });
  const { error, hasNext, isRefreshing, loadNext } = query;

  useEffect(() => {
    if (hasNext && !isRefreshing && !error) {
      void loadNext();
    }
  }, [error, hasNext, isRefreshing, loadNext]);

  return {
    error,
    isLoading: query.isLoading || hasNext || isRefreshing,
    records: !hasNext && !error ? query.pages.flatMap((page) => page.items) : [],
    refresh: query.refresh,
  };
}
