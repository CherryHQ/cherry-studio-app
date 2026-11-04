import { useMemo } from 'react';

import { useInfiniteQuery } from '@/frontend/data/hooks/useDataApi';

export function useAiUsageInvocations(enabled: boolean) {
  const query = useInfiniteQuery('/ai-usage-records/invocations', { enabled, limit: 50 });
  const items = useMemo(() => query.pages.flatMap((page) => page.items), [query.pages]);
  return { ...query, items };
}
