import { Button, Section } from '@cherrystudio/ui/components';
import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from '@legendapp/list/react-native';
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type NativeScrollEvent, type NativeSyntheticEvent, StyleSheet, View } from 'react-native';

import {
  type AiUsageWeekTimelineResult,
  useAiUsageWeekTimeline,
} from '../hooks/useAiUsageWeekTimeline';
import { useMeasuredWidth } from '../hooks/useMeasuredWidth';
import type { AiUsageDetailPage } from '../types';
import { AI_USAGE_CURRENT_WEEK_PAGE_INDEX } from '../utils/aiUsageDetail';
import { AiUsageWeekChartPage } from './AiUsageWeekChartPage';

const ADJACENT_PAGE_DISTANCE = 1;
const EMPTY_TIME_RANGE = { from: 0, to: 0 } as const;
/**
 * Every page renders the same box, so pinning the height keeps the section from
 * resizing mid-swipe: selected-day summary (64) + chart (150) + separator (1) +
 * week total row (20) + three gap-4 gutters (48).
 */
const WEEK_CHART_PAGE_HEIGHT = 283;

type AiUsageWeeklySectionProps = {
  activePageIndex: number;
  locale: string;
  pages: readonly AiUsageDetailPage[];
  todayDateKey: string;
  weekDataKey: string;
  onSelectDate: (pageKey: string, dateKey: string) => void;
  onSelectPage: (pageIndex: number) => void;
};

type AiUsageWeeklyListExtraData = {
  timelines: readonly (readonly [string | undefined, AiUsageWeekTimelineResult])[];
};

export function AiUsageWeeklySection({
  activePageIndex,
  locale,
  pages,
  todayDateKey,
  weekDataKey,
  onSelectDate,
  onSelectPage,
}: AiUsageWeeklySectionProps) {
  const { t } = useTranslation();
  const listRef = useRef<LegendListRef>(null);
  const visiblePageIndexRef = useRef(activePageIndex);
  const visibleWeekDataKeyRef = useRef(weekDataKey);
  const { onLayout, ref: viewportRef, width: pageWidth } = useMeasuredWidth();
  const previousPage = pages[activePageIndex - ADJACENT_PAGE_DISTANCE];
  const activePage = pages[activePageIndex];
  const nextPage = pages[activePageIndex + ADJACENT_PAGE_DISTANCE];
  const previousTimeline = useAiUsageWeekTimeline({
    enabled: previousPage !== undefined,
    range: previousPage?.range ?? EMPTY_TIME_RANGE,
    todayDateKey,
  });
  const activeTimeline = useAiUsageWeekTimeline({
    enabled: activePage !== undefined,
    range: activePage?.range ?? EMPTY_TIME_RANGE,
    todayDateKey,
  });
  const nextTimeline = useAiUsageWeekTimeline({
    enabled: nextPage !== undefined,
    range: nextPage?.range ?? EMPTY_TIME_RANGE,
    todayDateKey,
  });
  const listExtraData = useMemo<AiUsageWeeklyListExtraData>(
    () => ({
      timelines: [
        [previousPage?.key, previousTimeline],
        [activePage?.key, activeTimeline],
        [nextPage?.key, nextTimeline],
      ],
    }),
    [
      activePage?.key,
      activeTimeline,
      nextPage?.key,
      nextTimeline,
      previousPage?.key,
      previousTimeline,
    ],
  );

  useLayoutEffect(() => {
    const needsSync =
      visiblePageIndexRef.current !== activePageIndex ||
      visibleWeekDataKeyRef.current !== weekDataKey;

    if (pageWidth > 0 && needsSync) {
      visiblePageIndexRef.current = activePageIndex;
      visibleWeekDataKeyRef.current = weekDataKey;
      void listRef.current?.scrollToIndex({
        animated: false,
        index: activePageIndex,
      });
    }
  }, [activePageIndex, pageWidth, weekDataKey]);

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pageWidth <= 0) return;
      const nextPageIndex = Math.max(
        0,
        Math.min(pages.length - 1, Math.round(event.nativeEvent.contentOffset.x / pageWidth)),
      );
      visiblePageIndexRef.current = nextPageIndex;
      onSelectPage(nextPageIndex);
    },
    [onSelectPage, pageWidth, pages.length],
  );

  const handleShowCurrentWeek = useCallback(() => {
    visiblePageIndexRef.current = AI_USAGE_CURRENT_WEEK_PAGE_INDEX;
    void listRef.current?.scrollToIndex({
      animated: true,
      index: AI_USAGE_CURRENT_WEEK_PAGE_INDEX,
    });
    onSelectPage(AI_USAGE_CURRENT_WEEK_PAGE_INDEX);
  }, [onSelectPage]);

  const getFixedItemSize = useCallback(() => pageWidth, [pageWidth]);
  const renderItem = useCallback(
    ({ extraData, item }: LegendListRenderItemProps<AiUsageDetailPage>) => (
      <AiUsageWeekChartListItem
        locale={locale}
        page={item}
        pageWidth={pageWidth}
        timeline={getTimelineForPage(item.key, (extraData as AiUsageWeeklyListExtraData).timelines)}
        onSelectDate={onSelectDate}
      />
    ),
    [locale, onSelectDate, pageWidth],
  );

  return (
    <Section testID="ai-usage-week-section">
      <Section.Header title={t('aiUsage.tokenUsage')}>
        {activePageIndex === AI_USAGE_CURRENT_WEEK_PAGE_INDEX ? undefined : (
          <Button
            className="py-0"
            hitSlop={10}
            size="xs"
            testID="ai-usage-show-current-week"
            variant="ghost"
            onPress={handleShowCurrentWeek}
          >
            <Button.Label numberOfLines={1}>{t('aiUsage.showThisWeek')}</Button.Label>
          </Button>
        )}
      </Section.Header>
      <View className="p-4">
        <View ref={viewportRef} testID="ai-usage-week-viewport" onLayout={onLayout}>
          {pageWidth > 0 ? (
            <LegendList
              ref={listRef}
              bounces={false}
              contentInsetAdjustmentBehavior="never"
              data={pages}
              dataKey={weekDataKey}
              decelerationRate="fast"
              directionalLockEnabled
              disableIntervalMomentum
              drawDistance={pageWidth}
              extraData={listExtraData}
              getFixedItemSize={getFixedItemSize}
              horizontal
              initialScrollIndex={activePageIndex}
              itemsAreEqual={areDetailPagesEqual}
              keyExtractor={getWeekPageKey}
              nestedScrollEnabled
              pagingEnabled
              recycleItems
              renderItem={renderItem}
              showsHorizontalScrollIndicator={false}
              snapToAlignment="start"
              snapToInterval={pageWidth}
              style={styles.list}
              testID="ai-usage-week-list"
              onMomentumScrollEnd={handleMomentumScrollEnd}
            />
          ) : null}
        </View>
      </View>
    </Section>
  );
}

type AiUsageWeekChartListItemProps = {
  locale: string;
  page: AiUsageDetailPage;
  pageWidth: number;
  timeline?: AiUsageWeekTimelineResult;
  onSelectDate: (pageKey: string, dateKey: string) => void;
};

function AiUsageWeekChartListItem({
  locale,
  page,
  pageWidth,
  timeline,
  onSelectDate,
}: AiUsageWeekChartListItemProps) {
  const handleSelectDate = useCallback(
    (dateKey: string) => onSelectDate(page.key, dateKey),
    [onSelectDate, page.key],
  );

  return (
    <View
      style={{ height: WEEK_CHART_PAGE_HEIGHT, width: pageWidth }}
      testID={`ai-usage-week-item-${page.key}`}
    >
      <AiUsageWeekChartPage
        locale={locale}
        page={page}
        timeline={timeline}
        onSelectDate={handleSelectDate}
      />
    </View>
  );
}

function getTimelineForPage(
  pageKey: string,
  timelines: readonly (readonly [string | undefined, AiUsageWeekTimelineResult])[],
): AiUsageWeekTimelineResult | undefined {
  return timelines.find(([timelinePageKey]) => timelinePageKey === pageKey)?.[1];
}

function getWeekPageKey(page: AiUsageDetailPage): string {
  return page.key;
}

function areDetailPagesEqual(left: AiUsageDetailPage, right: AiUsageDetailPage): boolean {
  return (
    left.key === right.key &&
    left.range.from === right.range.from &&
    left.range.to === right.range.to &&
    left.selectedDateKey === right.selectedDateKey &&
    left.weeksAgo === right.weeksAgo
  );
}

const styles = StyleSheet.create({
  list: {
    height: WEEK_CHART_PAGE_HEIGHT,
  },
});
