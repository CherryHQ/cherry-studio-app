import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { aiUsageCalendar } from '@/frontend/utils/constants';

import { useMeasuredWidth } from '../hooks/useMeasuredWidth';
import type { AiUsageAnimationControls, AiUsageData } from '../types';
import {
  buildAiUsageCalendarWeeks,
  getAiUsageMonthLabelKeys,
  parseLocalDateKey,
} from '../utils/aiUsageCalendar';
import { AiUsageSquare } from './AiUsageSquare';

type AiUsageCalendarProps = {
  animationStartDateKey?: string;
  data: AiUsageData;
  isLoading: boolean;
  layout: 'fit' | 'scroll';
};

export function AiUsageCalendar({
  animationStartDateKey,
  data,
  isLoading,
  layout,
}: AiUsageCalendarProps) {
  const { i18n, t } = useTranslation();
  const squareRefs = useRef(new Map<string, AiUsageAnimationControls>());
  const scrollRef = useRef<ScrollView>(null);
  const { theme } = useUniwind();
  const levelColors = aiUsageCalendar.levelColors[theme === 'dark' ? 'dark' : 'light'];
  const weeks = useMemo(() => buildAiUsageCalendarWeeks(data), [data]);
  const monthLabelKeys = useMemo(() => getAiUsageMonthLabelKeys(weeks), [weeks]);
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { month: 'short' }),
    [i18n.language, i18n.resolvedLanguage],
  );
  const animationStartWeekIndex = useMemo(
    () =>
      animationStartDateKey
        ? weeks.findIndex((week) => week.some((day) => day.dateKey === animationStartDateKey))
        : -1,
    [animationStartDateKey, weeks],
  );
  const isScrollable = layout === 'scroll';
  const { onLayout, ref: calendarRef, width: availableWidth } = useMeasuredWidth(!isScrollable);
  const cellGap = isScrollable ? aiUsageCalendar.cellGap : aiUsageCalendar.summaryCellGap;
  const cellSize =
    !isScrollable && availableWidth > 0 && weeks.length > 0
      ? Math.max(1, (availableWidth - cellGap * (weeks.length - 1)) / weeks.length)
      : isScrollable
        ? aiUsageCalendar.cellSize
        : aiUsageCalendar.summaryFallbackCellSize;

  const replayAnimation = useCallback(() => {
    squareRefs.current.forEach((square) => {
      square.replayAnimation();
    });
  }, []);

  const scrollToLatest = useCallback(() => {
    if (isScrollable) {
      scrollRef.current?.scrollToEnd({ animated: false });
    }
  }, [isScrollable]);

  useEffect(() => {
    if (!isLoading && weeks.length > 0) {
      scrollToLatest();
      replayAnimation();
    }
  }, [animationStartDateKey, isLoading, replayAnimation, scrollToLatest, weeks]);

  const calendarGrid = (
    <Pressable
      accessibilityLabel={t('aiUsage.replay')}
      accessibilityRole="button"
      disabled={isLoading}
      testID="ai-usage-calendar-replay"
      onPress={replayAnimation}
    >
      <View style={[styles.grid, { gap: cellGap }]} testID="ai-usage-calendar-grid">
        {weeks.map((week, weekIndex) => {
          const monthLabelKey = monthLabelKeys[weekIndex];

          return (
            <View
              key={week[0].dateKey}
              style={[styles.weekColumn, { gap: cellGap, width: cellSize }]}
            >
              <Text
                className="text-muted-foreground"
                maxFontSizeMultiplier={1.1}
                numberOfLines={1}
                style={styles.monthLabel}
              >
                {monthLabelKey ? monthFormatter.format(parseLocalDateKey(monthLabelKey)) : ''}
              </Text>
              <View style={{ gap: cellGap }}>
                {week.map((day, dayIndex) =>
                  day.inRange ? (
                    <AiUsageSquare
                      cellSize={cellSize}
                      dayIndex={dayIndex}
                      isHighlighted={
                        animationStartDateKey !== undefined && day.dateKey >= animationStartDateKey
                      }
                      key={day.dateKey}
                      level={data[day.dateKey] ?? 0}
                      levelColors={levelColors}
                      ref={(square) => {
                        if (square) {
                          squareRefs.current.set(day.dateKey, square);
                        } else {
                          squareRefs.current.delete(day.dateKey);
                        }
                      }}
                      weekIndex={Math.max(0, weekIndex - animationStartWeekIndex)}
                    />
                  ) : (
                    <View key={day.dateKey} style={{ height: cellSize, width: cellSize }} />
                  ),
                )}
              </View>
            </View>
          );
        })}
      </View>
    </Pressable>
  );

  return (
    <View
      ref={isScrollable ? undefined : calendarRef}
      testID="ai-usage-calendar"
      onLayout={isScrollable ? undefined : onLayout}
    >
      {isScrollable ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          contentContainerStyle={styles.scrollContent}
          showsHorizontalScrollIndicator={false}
          testID="ai-usage-calendar-scroll"
          onContentSizeChange={scrollToLatest}
        >
          {calendarGrid}
        </ScrollView>
      ) : (
        calendarGrid
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
  },
  monthLabel: {
    fontSize: 10,
    height: 14,
    lineHeight: 14,
    overflow: 'visible',
    width: 48,
  },
  scrollContent: {
    minWidth: '100%',
  },
  weekColumn: {
    flexShrink: 0,
  },
});
