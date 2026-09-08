import { useQuery } from '@/frontend/data';

import type { AiUsageRankingGroup } from '../types';
import { buildAiUsageRanking, getAiUsageDayStatsQuery } from '../utils/aiUsageDetail';

/** Committed usage writes invalidate this cache, including background Agent turns. */
const RANKING_STALE_TIME = 1000 * 60;

type UseAiUsageRankingOptions = {
  enabled: boolean;
  groupBy: AiUsageRankingGroup;
  selectedDateKey: string;
};

export function useAiUsageRanking({ enabled, groupBy, selectedDateKey }: UseAiUsageRankingOptions) {
  const query = useQuery('/ai-usage-records/stats', {
    enabled,
    query: getAiUsageDayStatsQuery(selectedDateKey, groupBy),
    staleTime: RANKING_STALE_TIME,
  });

  return {
    query: {
      ...query,
      hasData: query.data !== undefined,
    },
    ranking: buildAiUsageRanking(query.data, groupBy),
  };
}
