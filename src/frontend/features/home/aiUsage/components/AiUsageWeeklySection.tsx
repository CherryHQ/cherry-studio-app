import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from '@legendapp/list/react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  View,
} from 'react-native';

import { Section } from '@/frontend/components/Section';

import type { AiUsageDetailPage } from '../types';
import { AI_USAGE_CURRENT_WEEK_PAGE_INDEX } from '../utils/aiUsageDetail';
import { AiUsageSectionAction } from './AiUsageSectionState';
import { AiUsageWeekChartPage } from './AiUsageWeekChartPage';

const ADJACENT_PAGE_DISTANCE = 1;
const WEEK_CHART_PAGE_HEIGHT = 270;

type AiUsageWeeklySectionProps = {
  activePageIndex: number;
  locale: string;
  pages: readonly AiUsageDetailPage[];
  todayDateKey: string;
  weekDataKey: string;
  onSelectDate: (pageKey: string, dateKey: string) => void;
  onSelectPage: (pageIndex: number) => void;
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
  const visiblePageIndexRef = useRef<number | null>(null);
  const visibleWeekDataKeyRef = useRef<string | null>(null);
  const [pageWidth, setPageWidth] = useState(0);

  useEffect(() => {
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

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    setPageWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
  }, []);

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
    ({ extraData, index, item }: LegendListRenderItemProps<AiUsageDetailPage>) => (
      <AiUsageWeekChartListItem
        activePageIndex={extraData as number}
        index={index}
        locale={locale}
        page={item}
        pageWidth={pageWidth}
        todayDateKey={todayDateKey}
        onSelectDate={onSelectDate}
      />
    ),
    [locale, onSelectDate, pageWidth, todayDateKey],
  );

  return (
    <Section
      action={
        activePageIndex === AI_USAGE_CURRENT_WEEK_PAGE_INDEX ? undefined : (
          <AiUsageSectionAction
            compact
            label={t('aiUsage.showThisWeek')}
            testID="ai-usage-show-current-week"
            onPress={handleShowCurrentWeek}
          />
        )
      }
      testID="ai-usage-week-section"
      title={t('aiUsage.tokenUsage')}
    >
      <View className="p-4">
        <View testID="ai-usage-week-viewport" onLayout={handleLayout}>
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
              extraData={activePageIndex}
              getFixedItemSize={getFixedItemSize}
              horizontal
              initialScrollIndex={AI_USAGE_CURRENT_WEEK_PAGE_INDEX}
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
  activePageIndex: number;
  index: number;
  locale: string;
  page: AiUsageDetailPage;
  pageWidth: number;
  todayDateKey: string;
  onSelectDate: (pageKey: string, dateKey: string) => void;
};

function AiUsageWeekChartListItem({
  activePageIndex,
  index,
  locale,
  page,
  pageWidth,
  todayDateKey,
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
        enabled={Math.abs(index - activePageIndex) <= ADJACENT_PAGE_DISTANCE}
        locale={locale}
        page={page}
        todayDateKey={todayDateKey}
        onSelectDate={handleSelectDate}
      />
    </View>
  );
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
