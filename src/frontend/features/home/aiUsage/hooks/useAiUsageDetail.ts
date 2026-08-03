import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useQuery } from '@/frontend/data';

import { toLocalDateKey } from '../utils/aiUsageCalendar';
import {
  buildAiUsageModelUsage,
  buildAiUsageWeeklyData,
  getAiUsageDayRange,
  getAiUsageWeekRange,
} from '../utils/aiUsageDetail';

export function useAiUsageDetail() {
  const [referenceDate, setReferenceDate] = useState(() => new Date());
  const [selectedDateKey, setSelectedDateKey] = useState(() => toLocalDateKey(new Date()));
  const todayDateKey = toLocalDateKey(referenceDate);
  const weekRange = useMemo(() => getAiUsageWeekRange(referenceDate), [referenceDate]);
  const selectedDayRange = useMemo(() => getAiUsageDayRange(selectedDateKey), [selectedDateKey]);
  const timelineQueryParams = useMemo(
    () => ({
      from: weekRange.from,
      groupBy: 'model' as const,
      limit: 3,
      metric: 'tokens' as const,
      to: weekRange.to,
    }),
    [weekRange],
  );
  const modelQueryParams = useMemo(
    () => ({
      from: selectedDayRange.from,
      groupBy: 'model' as const,
      limit: 50,
      metric: 'tokens' as const,
      to: selectedDayRange.to,
    }),
    [selectedDayRange],
  );
  const timelineQuery = useQuery('/ai-usage-records/timeline', { query: timelineQueryParams });
  const modelQuery = useQuery('/ai-usage-records/stats', { query: modelQueryParams });
  const hasFocusedOnceRef = useRef(false);
  const todayDateKeyRef = useRef(todayDateKey);
  const weekStartDateKeyRef = useRef(toLocalDateKey(new Date(weekRange.from)));
  const timelineRefetchRef = useRef(timelineQuery.refetch);
  const modelRefetchRef = useRef(modelQuery.refetch);

  useEffect(() => {
    todayDateKeyRef.current = todayDateKey;
    weekStartDateKeyRef.current = toLocalDateKey(new Date(weekRange.from));
    timelineRefetchRef.current = timelineQuery.refetch;
    modelRefetchRef.current = modelQuery.refetch;
  }, [modelQuery.refetch, timelineQuery.refetch, todayDateKey, weekRange.from]);

  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return;
      }

      const nextReferenceDate = new Date();
      const nextTodayDateKey = toLocalDateKey(nextReferenceDate);
      if (nextTodayDateKey !== todayDateKeyRef.current) {
        const nextWeekRange = getAiUsageWeekRange(nextReferenceDate);
        const nextWeekStartDateKey = toLocalDateKey(new Date(nextWeekRange.from));
        if (nextWeekStartDateKey === weekStartDateKeyRef.current) {
          void timelineRefetchRef.current();
        }
        setReferenceDate(nextReferenceDate);
        setSelectedDateKey(nextTodayDateKey);
        return;
      }

      void Promise.all([timelineRefetchRef.current(), modelRefetchRef.current()]);
    }, []),
  );

  const weeklyData = useMemo(
    () => buildAiUsageWeeklyData(timelineQuery.data?.buckets ?? [], weekRange, todayDateKey),
    [timelineQuery.data?.buckets, todayDateKey, weekRange],
  );
  const modelUsage = useMemo(() => buildAiUsageModelUsage(modelQuery.data), [modelQuery.data]);
  const selectDate = useCallback(
    (dateKey: string) => {
      const firstDateKey = weeklyData.days[0]?.dateKey;
      const lastDateKey = weeklyData.days.at(-1)?.dateKey;
      if (
        !firstDateKey ||
        !lastDateKey ||
        dateKey < firstDateKey ||
        dateKey > lastDateKey ||
        dateKey > todayDateKey
      ) {
        return;
      }
      setSelectedDateKey(dateKey);
    },
    [todayDateKey, weeklyData.days],
  );

  return {
    modelUsage,
    models: {
      ...modelQuery,
      hasData: modelQuery.data !== undefined,
    },
    selectDate,
    selectedDateKey,
    timeline: {
      ...timelineQuery,
      hasData: timelineQuery.data !== undefined,
    },
    todayDateKey,
    weeklyData,
    weekRange,
  };
}
