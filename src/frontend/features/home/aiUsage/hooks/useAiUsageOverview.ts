import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useQuery } from '@/frontend/data';

import type { AiUsageWindowKey } from '../types';
import { toLocalDateKey } from '../utils/aiUsageCalendar';
import { buildAiUsageOverview, getAiUsageWindowRange } from '../utils/aiUsageOverview';

export function useAiUsageOverview(
  windowKey: AiUsageWindowKey,
  timelineWindowKey: AiUsageWindowKey = '365d',
) {
  const [endDate, setEndDate] = useState(() => new Date());
  const range = useMemo(() => getAiUsageWindowRange(windowKey, endDate), [endDate, windowKey]);
  const timelineRange = useMemo(
    () => getAiUsageWindowRange(timelineWindowKey, endDate),
    [endDate, timelineWindowKey],
  );
  const query = useMemo(
    () => ({ from: timelineRange.from, limit: 1, metric: 'tokens' as const, to: timelineRange.to }),
    [timelineRange],
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
  const timelineOverview = useMemo(
    () => buildAiUsageOverview(buckets ?? [], timelineRange),
    [buckets, timelineRange],
  );
  const overview = useMemo(
    () =>
      windowKey === timelineWindowKey
        ? timelineOverview
        : buildAiUsageOverview(buckets ?? [], range),
    [buckets, range, timelineOverview, timelineWindowKey, windowKey],
  );

  return {
    ...timelineQuery,
    calendarData: timelineOverview.data,
    hasData: timelineQuery.data !== undefined,
    overview,
    range,
  };
}
