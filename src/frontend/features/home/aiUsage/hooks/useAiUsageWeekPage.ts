import { useMemo } from 'react';

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
  const timelineQueryParams = useMemo(() => getAiUsageWeekTimelineQuery(range), [range]);
  const modelQueryParams = useMemo(
    () => getAiUsageDayStatsQuery(selectedDateKey),
    [selectedDateKey],
  );
  const timelineQuery = useQuery('/ai-usage-records/timeline', {
    enabled,
    query: timelineQueryParams,
  });
  const modelQuery = useQuery('/ai-usage-records/stats', {
    enabled,
    query: modelQueryParams,
  });
  const weeklyData = useMemo(
    () => buildAiUsageWeeklyData(timelineQuery.data?.buckets ?? [], range, todayDateKey),
    [range, timelineQuery.data?.buckets, todayDateKey],
  );
  const modelUsage = useMemo(() => buildAiUsageModelUsage(modelQuery.data), [modelQuery.data]);

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
