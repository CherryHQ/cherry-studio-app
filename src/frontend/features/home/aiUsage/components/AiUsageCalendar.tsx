import { PlayIcon } from 'lucide-uniwind';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { homeAiUsageCalendar } from '@/frontend/utils/constants';

import type { AiUsageAnimationControls, AiUsageData, AiUsageWindowKey } from '../types';
import {
  buildAiUsageCalendarWeeks,
  getAiUsageMonthLabelKeys,
  parseLocalDateKey,
} from '../utils/aiUsageCalendar';
import { AiUsageSquare } from './AiUsageSquare';

type AiUsageCalendarProps = {
  data: AiUsageData;
  isLoading: boolean;
  windowKey: AiUsageWindowKey;
};

export function AiUsageCalendar({ data, isLoading, windowKey }: AiUsageCalendarProps) {
  const { i18n, t } = useTranslation();
  const squareRefs = useRef(new Map<string, AiUsageAnimationControls>());
  const scrollRef = useRef<ScrollView>(null);
  const { theme } = useUniwind();
  const levelColors = homeAiUsageCalendar.levelColors[theme === 'dark' ? 'dark' : 'light'];
  const weeks = useMemo(() => buildAiUsageCalendarWeeks(data), [data]);
  const monthLabelKeys = useMemo(() => getAiUsageMonthLabelKeys(weeks), [weeks]);
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { month: 'short' }),
    [i18n.language, i18n.resolvedLanguage],
  );
  const isScrollable = windowKey === '365d';

  const replayAnimation = useCallback(() => {
    squareRefs.current.forEach((square) => {
      square.replayAnimation();
    });
  }, []);

  useEffect(() => {
    if (!isLoading && weeks.length > 0) {
      replayAnimation();
    }
  }, [isLoading, replayAnimation, weeks]);

  const handleContentSizeChange = useCallback(() => {
    if (isScrollable) {
      scrollRef.current?.scrollToEnd({ animated: false });
    }
  }, [isScrollable]);

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="font-medium text-default-foreground text-sm">
          {t('home.aiUsage.dailyActivity')}
        </Text>
        <Pressable
          accessibilityLabel={t('home.aiUsage.replay')}
          accessibilityRole="button"
          className="size-8 items-center justify-center rounded-full active:bg-surface-secondary active:opacity-70"
          disabled={isLoading}
          hitSlop={6}
          testID="ai-usage-replay"
          onPress={replayAnimation}
        >
          <PlayIcon className="size-4 text-primary" fill="currentColor" strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        contentContainerStyle={isScrollable ? styles.scrollContent : styles.centeredContent}
        scrollEnabled={isScrollable}
        showsHorizontalScrollIndicator={false}
        testID="ai-usage-calendar-scroll"
        onContentSizeChange={handleContentSizeChange}
      >
        <View style={styles.grid} testID="ai-usage-calendar-grid">
          {weeks.map((week, weekIndex) => {
            const monthLabelKey = monthLabelKeys[weekIndex];

            return (
              <View key={week[0].dateKey} style={styles.weekColumn}>
                <Text
                  className="text-muted-foreground"
                  maxFontSizeMultiplier={1.1}
                  numberOfLines={1}
                  style={styles.monthLabel}
                >
                  {monthLabelKey ? monthFormatter.format(parseLocalDateKey(monthLabelKey)) : ''}
                </Text>
                <View style={styles.week}>
                  {week.map((day, dayIndex) =>
                    day.inRange ? (
                      <AiUsageSquare
                        dayIndex={dayIndex}
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
                        weekIndex={weekIndex}
                      />
                    ) : (
                      <View key={day.dateKey} style={styles.emptySquare} />
                    ),
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  centeredContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptySquare: {
    height: homeAiUsageCalendar.cellSize,
    width: homeAiUsageCalendar.cellSize,
  },
  grid: {
    flexDirection: 'row',
    gap: homeAiUsageCalendar.cellGap,
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
  week: {
    gap: homeAiUsageCalendar.cellGap,
  },
  weekColumn: {
    gap: homeAiUsageCalendar.cellGap,
    width: homeAiUsageCalendar.cellSize,
  },
});
