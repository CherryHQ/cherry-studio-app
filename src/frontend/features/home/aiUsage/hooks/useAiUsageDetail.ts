import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { queryKeys } from '@/frontend/data';

import type { AiUsageWeekPage } from '../types';
import { toLocalDateKey } from '../utils/aiUsageCalendar';
import {
  AI_USAGE_CURRENT_WEEK_PAGE_INDEX,
  getAiUsageDayStatsQuery,
  getAiUsageRecentWeekPages,
  getAiUsageWeekDefaultDateKey,
  getAiUsageWeekTimelineQuery,
} from '../utils/aiUsageDetail';

type SelectedDateKeys = Readonly<Record<string, string>>;

type DetailStateSnapshot = {
  activePageIndex: number;
  pages: AiUsageWeekPage[];
  selectedDateKeys: SelectedDateKeys;
  todayDateKey: string;
};

export function useAiUsageDetail() {
  const queryClient = useQueryClient();
  const [referenceDate, setReferenceDate] = useState(() => new Date());
  const [activePageIndex, setActivePageIndex] = useState(AI_USAGE_CURRENT_WEEK_PAGE_INDEX);
  const pages = useMemo(() => getAiUsageRecentWeekPages(referenceDate), [referenceDate]);
  const [selectedDateKeys, setSelectedDateKeys] = useState<SelectedDateKeys>(() =>
    createSelectedDateKeys(pages, referenceDate),
  );
  const todayDateKey = toLocalDateKey(referenceDate);
  const weekDataKey = pages[AI_USAGE_CURRENT_WEEK_PAGE_INDEX]?.key ?? todayDateKey;
  const hasFocusedOnceRef = useRef(false);
  const stateRef = useRef<DetailStateSnapshot>({
    activePageIndex,
    pages,
    selectedDateKeys,
    todayDateKey,
  });

  useEffect(() => {
    stateRef.current = {
      activePageIndex,
      pages,
      selectedDateKeys,
      todayDateKey,
    };
  }, [activePageIndex, pages, selectedDateKeys, todayDateKey]);

  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return;
      }

      const state = stateRef.current;
      const nextReferenceDate = new Date();
      const nextTodayDateKey = toLocalDateKey(nextReferenceDate);
      const nextPages = getAiUsageRecentWeekPages(nextReferenceDate);
      const currentWeekKey = state.pages[AI_USAGE_CURRENT_WEEK_PAGE_INDEX]?.key;
      const nextCurrentWeekKey = nextPages[AI_USAGE_CURRENT_WEEK_PAGE_INDEX]?.key;

      if (nextCurrentWeekKey !== currentWeekKey) {
        const nextSelectedDateKeys = createSelectedDateKeys(nextPages, nextReferenceDate);
        stateRef.current = {
          activePageIndex: AI_USAGE_CURRENT_WEEK_PAGE_INDEX,
          pages: nextPages,
          selectedDateKeys: nextSelectedDateKeys,
          todayDateKey: nextTodayDateKey,
        };
        setReferenceDate(nextReferenceDate);
        setActivePageIndex(AI_USAGE_CURRENT_WEEK_PAGE_INDEX);
        setSelectedDateKeys(nextSelectedDateKeys);
        return;
      }

      const currentPage = state.pages[AI_USAGE_CURRENT_WEEK_PAGE_INDEX];
      if (currentPage && nextCurrentWeekKey) {
        const nextSelectedDateKeys =
          state.selectedDateKeys[nextCurrentWeekKey] === nextTodayDateKey
            ? state.selectedDateKeys
            : { ...state.selectedDateKeys, [nextCurrentWeekKey]: nextTodayDateKey };

        stateRef.current = {
          ...state,
          activePageIndex: AI_USAGE_CURRENT_WEEK_PAGE_INDEX,
          selectedDateKeys: nextSelectedDateKeys,
          todayDateKey: nextTodayDateKey,
        };
        if (nextTodayDateKey !== state.todayDateKey) {
          setReferenceDate(nextReferenceDate);
        }
        setActivePageIndex(AI_USAGE_CURRENT_WEEK_PAGE_INDEX);
        setSelectedDateKeys(nextSelectedDateKeys);
        void refreshPage(queryClient, currentPage, nextTodayDateKey);
      }
    }, [queryClient]),
  );

  const selectPage = useCallback((pageIndex: number) => {
    if (pageIndex < 0 || pageIndex >= stateRef.current.pages.length) return;
    stateRef.current = { ...stateRef.current, activePageIndex: pageIndex };
    setActivePageIndex(pageIndex);
  }, []);

  const selectDate = useCallback((pageKey: string, dateKey: string) => {
    const state = stateRef.current;
    const page = state.pages.find((item) => item.key === pageKey);
    if (!page || !isSelectableDate(dateKey, page, state.todayDateKey)) return;

    const nextSelectedDateKeys = { ...state.selectedDateKeys, [pageKey]: dateKey };
    stateRef.current = { ...state, selectedDateKeys: nextSelectedDateKeys };
    setSelectedDateKeys(nextSelectedDateKeys);
  }, []);

  const detailPages = useMemo(
    () =>
      pages.map((page) => ({
        ...page,
        selectedDateKey: getSelectedDateKey(page, selectedDateKeys, referenceDate),
      })),
    [pages, referenceDate, selectedDateKeys],
  );

  return {
    activePageIndex,
    pages: detailPages,
    selectDate,
    selectPage,
    todayDateKey,
    weekDataKey,
  };
}

function createSelectedDateKeys(
  pages: readonly AiUsageWeekPage[],
  referenceDate: Date,
): SelectedDateKeys {
  return Object.fromEntries(
    pages.map((page) => [page.key, getAiUsageWeekDefaultDateKey(referenceDate, page.weeksAgo)]),
  );
}

function getSelectedDateKey(
  page: AiUsageWeekPage,
  selectedDateKeys: SelectedDateKeys,
  referenceDate: Date,
): string {
  return selectedDateKeys[page.key] ?? getAiUsageWeekDefaultDateKey(referenceDate, page.weeksAgo);
}

function isSelectableDate(dateKey: string, page: AiUsageWeekPage, todayDateKey: string): boolean {
  const firstDateKey = toLocalDateKey(new Date(page.range.from));
  const lastDateKey = toLocalDateKey(new Date(page.range.to));
  return dateKey >= firstDateKey && dateKey <= lastDateKey && dateKey <= todayDateKey;
}

function refreshPage(queryClient: QueryClient, page: AiUsageWeekPage, selectedDateKey: string) {
  return Promise.all([
    queryClient.invalidateQueries({
      exact: true,
      queryKey: queryKeys.aiUsageRecords.timeline(getAiUsageWeekTimelineQuery(page.range)),
    }),
    queryClient.invalidateQueries({
      exact: true,
      queryKey: queryKeys.aiUsageRecords.stats(getAiUsageDayStatsQuery(selectedDateKey, 'model')),
    }),
    queryClient.invalidateQueries({
      exact: true,
      queryKey: queryKeys.aiUsageRecords.stats(
        getAiUsageDayStatsQuery(selectedDateKey, 'provider'),
      ),
    }),
  ]);
}
