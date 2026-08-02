import { FlameIcon } from 'lucide-uniwind';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useUniwind } from 'uniwind';

import { homeAiUsageCalendar } from '@/frontend/utils/constants';

import type { AiUsageAnimationControls, AiUsageData } from '../types';
import { buildAiUsageCalendarWeeks, getAiUsageSummary } from '../utils/aiUsageCalendar';
import { AiUsageSquare } from './AiUsageSquare';

export type AiUsageCardProps = {
  data: AiUsageData;
};

export function AiUsageCard({ data }: AiUsageCardProps) {
  const { t } = useTranslation();
  const squareRefs = useRef(new Map<string, AiUsageAnimationControls>());
  const isAnimatingRef = useRef(false);
  const pressed = useSharedValue(false);
  // useUniwind, not useColorScheme: the app theme preference can pin dark/light
  // independently of the system appearance, and the squares must match the card.
  const { theme } = useUniwind();
  const levelColors = homeAiUsageCalendar.levelColors[theme === 'dark' ? 'dark' : 'light'];

  const weeks = useMemo(() => buildAiUsageCalendarWeeks(data), [data]);
  const aiUsageSummary = useMemo(() => getAiUsageSummary(data), [data]);

  const startAnimation = useCallback(() => {
    isAnimatingRef.current = true;
    squareRefs.current.forEach((square) => {
      square.startAnimation();
    });
  }, []);

  const resetAnimation = useCallback(() => {
    isAnimatingRef.current = false;
    squareRefs.current.forEach((square) => {
      square.resetAnimation();
    });
  }, []);

  const toggleAnimation = useCallback(() => {
    if (isAnimatingRef.current) {
      resetAnimation();
    } else {
      startAnimation();
    }
  }, [resetAnimation, startAnimation]);

  // The reference demo waits for a tap; auto-playing once on mount (and when
  // the data changes) keeps the card from sitting all-grey on the Home tab.
  useEffect(() => {
    if (weeks.length > 0) {
      startAnimation();
    }
  }, [startAnimation, weeks]);

  const handlePressIn = useCallback(() => {
    pressed.set(true);
  }, [pressed]);

  const handlePressOut = useCallback(() => {
    pressed.set(false);
  }, [pressed]);

  const pressAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withTiming(pressed.get() ? homeAiUsageCalendar.pressedScale : 1, {
          duration: 120,
        }),
      },
    ],
  }));

  return (
    <Pressable
      accessibilityHint={t('home.aiUsage.toggleHint')}
      accessibilityLabel={t('home.aiUsage.title')}
      accessibilityRole="button"
      onPress={toggleAnimation}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.pressable}
    >
      <Animated.View style={pressAnimatedStyle}>
        <View className="rounded-2xl bg-surface p-4" style={styles.card}>
          <View style={styles.grid}>
            {weeks.map((week, weekIndex) => (
              <View key={week[0].dateKey} style={styles.week}>
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
                          return () => {
                            squareRefs.current.delete(day.dateKey);
                          };
                        }
                      }}
                      weekIndex={weekIndex}
                    />
                  ) : (
                    <View key={day.dateKey} style={styles.emptySquare} />
                  ),
                )}
              </View>
            ))}
          </View>
          <View className="mt-4 flex-row items-center justify-between gap-2">
            <View className="min-w-0 flex-row items-center gap-1.5 rounded-full bg-surface-secondary px-3 py-1">
              <FlameIcon className="size-4 text-primary" strokeWidth={2.25} />
              <Text
                className="shrink text-primary text-sm"
                numberOfLines={1}
                style={styles.statText}
              >
                {t('home.aiUsage.yearlyDays', { count: aiUsageSummary.yearActiveDays })}
              </Text>
            </View>
            <View className="min-w-0 shrink rounded-full bg-surface-secondary px-3 py-1">
              <Text
                className="text-default-foreground text-sm"
                numberOfLines={1}
                style={styles.statText}
              >
                {t('home.aiUsage.weeklyDays', {
                  count: aiUsageSummary.weekActiveDays,
                  total: aiUsageSummary.weekElapsedDays,
                })}
              </Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderCurve: 'continuous',
    boxShadow: homeAiUsageCalendar.cardShadow,
  },
  emptySquare: {
    height: homeAiUsageCalendar.cellSize,
    width: homeAiUsageCalendar.cellSize,
  },
  grid: {
    flexDirection: 'row',
    gap: homeAiUsageCalendar.cellGap,
  },
  pressable: {
    alignSelf: 'center',
  },
  statText: {
    fontVariant: ['tabular-nums'],
  },
  week: {
    gap: homeAiUsageCalendar.cellGap,
  },
});
