import { useQuery } from '@/frontend/data';

import type { AiUsageTimeRange } from '../types';
import { buildAiUsageWeeklyData, getAiUsageWeekTimelineQuery } from '../utils/aiUsageDetail';

type UseAiUsageWeekTimelineOptions = {
  enabled: boolean;
  range: AiUsageTimeRange;
  todayDateKey: string;
};

export function useAiUsageWeekTimeline({
  enabled,
  range,
  todayDateKey,
}: UseAiUsageWeekTimelineOptions) {
  const query = useQuery('/ai-usage-records/timeline', {
    enabled,
    query: getAiUsageWeekTimelineQuery(range),
  });

  return {
    query: {
      ...query,
      hasData: query.data !== undefined,
    },
    weeklyData: buildAiUsageWeeklyData(query.data?.buckets ?? [], range, todayDateKey),
  };
}
