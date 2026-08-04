import { useQuery } from '@/frontend/data';

import type { AiUsageRankingGroup } from '../types';
import { buildAiUsageRanking, getAiUsageDayStatsQuery } from '../utils/aiUsageDetail';

type UseAiUsageRankingOptions = {
  enabled: boolean;
  groupBy: AiUsageRankingGroup;
  selectedDateKey: string;
};

export function useAiUsageRanking({ enabled, groupBy, selectedDateKey }: UseAiUsageRankingOptions) {
  const query = useQuery('/ai-usage-records/stats', {
    enabled,
    query: getAiUsageDayStatsQuery(selectedDateKey, groupBy),
  });

  return {
    query: {
      ...query,
      hasData: query.data !== undefined,
    },
    ranking: buildAiUsageRanking(query.data, groupBy),
  };
}
