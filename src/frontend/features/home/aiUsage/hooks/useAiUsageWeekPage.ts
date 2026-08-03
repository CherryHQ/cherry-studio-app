import { useQuery } from '@/frontend/data';

import type { AiUsageTimeRange } from '../types';
import {
  buildAiUsageModelUsage,
  buildAiUsageWeeklyData,
  getAiUsageDayStatsQuery,
  getAiUsageWeekTimelineQuery,
} from '../utils/aiUsageDetail';

type UseAiUsageWeekPageOptions = {
  enabled: boolean;
  range: AiUsageTimeRange;
  selectedDateKey: string;
  todayDateKey: string;
};

export function useAiUsageWeekPage({
  enabled,
  range,
  selectedDateKey,
  todayDateKey,
}: UseAiUsageWeekPageOptions) {
  const timelineQueryParams = getAiUsageWeekTimelineQuery(range);
  const modelQueryParams = getAiUsageDayStatsQuery(selectedDateKey);
  const timelineQuery = useQuery('/ai-usage-records/timeline', {
    enabled,
    query: timelineQueryParams,
  });
  const modelQuery = useQuery('/ai-usage-records/stats', {
    enabled,
    query: modelQueryParams,
  });
  const weeklyData = buildAiUsageWeeklyData(timelineQuery.data?.buckets ?? [], range, todayDateKey);
  const modelUsage = buildAiUsageModelUsage(modelQuery.data);

  return {
    modelUsage,
    models: {
      ...modelQuery,
      hasData: modelQuery.data !== undefined,
    },
    timeline: {
      ...timelineQuery,
      hasData: timelineQuery.data !== undefined,
    },
    weeklyData,
  };
}
