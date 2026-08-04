import { useEffect } from 'react';

import { usePrefetch, useQuery } from '@/frontend/data';

import type { AiUsageRankingGroup } from '../types';
import { buildAiUsageRanking, getAiUsageDayStatsQuery } from '../utils/aiUsageDetail';

/**
 * Day stats only change when new usage is recorded, which cannot happen while this
 * screen is focused. Refreshing on focus is handled by the detail hook instead.
 */
const RANKING_STALE_TIME = 1000 * 60;

type UseAiUsageRankingOptions = {
  enabled: boolean;
  groupBy: AiUsageRankingGroup;
  selectedDateKey: string;
};

export function useAiUsageRanking({ enabled, groupBy, selectedDateKey }: UseAiUsageRankingOptions) {
  const prefetch = usePrefetch();
  const query = useQuery('/ai-usage-records/stats', {
    enabled,
    keepPreviousData: true,
    query: getAiUsageDayStatsQuery(selectedDateKey, groupBy),
    staleTime: RANKING_STALE_TIME,
  });

  // Warm the grouping the toggle switches to, so toggling never hits a cold cache.
  useEffect(() => {
    if (!enabled) return;

    void prefetch('/ai-usage-records/stats', {
      query: getAiUsageDayStatsQuery(selectedDateKey, groupBy === 'model' ? 'provider' : 'model'),
      staleTime: RANKING_STALE_TIME,
    });
  }, [enabled, groupBy, prefetch, selectedDateKey]);

  return {
    query: {
      ...query,
      hasData: query.data !== undefined,
    },
    ranking: buildAiUsageRanking(query.data, groupBy),
  };
}
