import { FlameIcon } from 'lucide-uniwind';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useUniwind } from 'uniwind';

import { homeActivityCalendar } from '@/config/constants';

import type { ActivityAnimationControls, ActivityData } from '../types';
import { buildActivityCalendarWeeks, getActivitySummary } from '../utils/calendarLayout';
import { ActivitySquare } from './ActivitySquare';

export type HomeActivityCardProps = {
  data: ActivityData;
};

export function HomeActivityCard({ data }: HomeActivityCardProps) {
  const { t } = useTranslation();
  const squareRefs = useRef(new Map<string, ActivityAnimationControls>());
  const isAnimatingRef = useRef(false);
  const pressed = useSharedValue(false);
  // useUniwind, not useColorScheme: the app theme preference can pin dark/light
  // independently of the system appearance, and the squares must match the card.
  const { theme } = useUniwind();
  const levelColors = homeActivityCalendar.levelColors[theme === 'dark' ? 'dark' : 'light'];

  const weeks = useMemo(() => buildActivityCalendarWeeks(data), [data]);
  const activitySummary = useMemo(() => getActivitySummary(data), [data]);

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
        scale: withTiming(pressed.get() ? homeActivityCalendar.pressedScale : 1, {
          duration: 120,
        }),
      },
    ],
  }));

  return (
    <Pressable
      accessibilityHint={t('home.activity.toggleHint')}
      accessibilityLabel={t('home.activity.title')}
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
                    <ActivitySquare
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
              <FlameIcon className="size-4 text-accent" strokeWidth={2.25} />
              <Text
                className="shrink text-accent text-sm"
                numberOfLines={1}
                style={styles.statText}
              >
                {t('home.activity.yearlyDays', { count: activitySummary.yearActiveDays })}
              </Text>
            </View>
            <View className="min-w-0 shrink rounded-full bg-surface-secondary px-3 py-1">
              <Text
                className="text-default-foreground text-sm"
                numberOfLines={1}
                style={styles.statText}
              >
                {t('home.activity.weeklyDays', {
                  count: activitySummary.weekActiveDays,
                  total: activitySummary.weekElapsedDays,
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
    boxShadow: homeActivityCalendar.cardShadow,
  },
  emptySquare: {
    height: homeActivityCalendar.cellSize,
    width: homeActivityCalendar.cellSize,
  },
  grid: {
    flexDirection: 'row',
    gap: homeActivityCalendar.cellGap,
  },
  pressable: {
    alignSelf: 'center',
  },
  statText: {
    fontVariant: ['tabular-nums'],
  },
  week: {
    gap: homeActivityCalendar.cellGap,
  },
});
