import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useQuery } from '@/frontend/data';

import { toLocalDateKey } from '../utils/aiUsageCalendar';
import { buildAiUsageCalendarData, getAiUsageSummaryRange } from '../utils/aiUsageOverview';

export function useAiUsageOverview() {
  const [endDate, setEndDate] = useState(() => new Date());
  const range = useMemo(() => getAiUsageSummaryRange(endDate), [endDate]);
  const query = useMemo(
    () => ({ from: range.from, limit: 1, metric: 'tokens' as const, to: range.to }),
    [range],
  );
  const timelineQuery = useQuery('/ai-usage-records/timeline', { query });
  const hasFocusedOnceRef = useRef(false);
  const endDateKeyRef = useRef(toLocalDateKey(endDate));
  const refetchRef = useRef(timelineQuery.refetch);

  useEffect(() => {
    refetchRef.current = timelineQuery.refetch;
  }, [timelineQuery.refetch]);

  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return;
      }

      const nextEndDate = new Date();
      const nextEndDateKey = toLocalDateKey(nextEndDate);
      if (nextEndDateKey !== endDateKeyRef.current) {
        endDateKeyRef.current = nextEndDateKey;
        setEndDate(nextEndDate);
      } else {
        void refetchRef.current();
      }
    }, []),
  );

  const buckets = timelineQuery.data?.buckets;
  const calendarData = useMemo(
    () => buildAiUsageCalendarData(buckets ?? [], range),
    [buckets, range],
  );

  return {
    ...timelineQuery,
    calendarData,
    hasData: timelineQuery.data !== undefined,
    range,
  };
}
