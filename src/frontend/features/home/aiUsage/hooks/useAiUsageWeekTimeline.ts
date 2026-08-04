import { useQuery } from '@/frontend/data';

import type { AiUsageTimeRange } from '../types';
import {
  buildAiUsageWeeklyData,
  getAiUsagePreviousWeekRange,
  getAiUsageWeekOverWeekChange,
  getAiUsageWeekTimelineQuery,
} from '../utils/aiUsageDetail';

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
  const previousRange = getAiUsagePreviousWeekRange(range);
  const previousQuery = useQuery('/ai-usage-records/timeline', {
    enabled,
    query: getAiUsageWeekTimelineQuery(previousRange),
  });
  const weeklyData = buildAiUsageWeeklyData(query.data?.buckets ?? [], range, todayDateKey);
  const previousWeeklyData = previousQuery.data
    ? buildAiUsageWeeklyData(previousQuery.data.buckets, previousRange, todayDateKey)
    : undefined;

  return {
    query: {
      ...query,
      hasData: query.data !== undefined,
    },
    weekOverWeekChange: getAiUsageWeekOverWeekChange(
      weeklyData.totalTokens,
      previousWeeklyData?.totalTokens,
    ),
    weeklyData,
  };
}

export type AiUsageWeekTimelineResult = ReturnType<typeof useAiUsageWeekTimeline>;
