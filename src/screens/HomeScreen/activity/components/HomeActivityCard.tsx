import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { homeActivityCalendar } from '@/config/constants';

import type { ActivityAnimationControls, ActivityData } from '../types';
import {
  activityCalendarRowCount,
  addCalendarDays,
  buildActivityCalendarWeeks,
  normalizeLocalDate,
} from '../utils/calendarLayout';
import { ActivitySquare } from './ActivitySquare';

export type HomeActivityCardProps = {
  data: ActivityData;
};

export function HomeActivityCard({ data }: HomeActivityCardProps) {
  const { i18n, t } = useTranslation();
  const squareRefs = useRef(new Map<string, ActivityAnimationControls>());
  const isAnimatingRef = useRef(false);
  const pressed = useSharedValue(false);

  const weeks = useMemo(() => buildActivityCalendarWeeks(data), [data]);
  const weekdayLabels = useMemo(
    () => buildWeekdayLabels(i18n.resolvedLanguage ?? i18n.language),
    [i18n.language, i18n.resolvedLanguage],
  );

  const startAnimation = useCallback(() => {
    isAnimatingRef.current = true;
    squareRefs.current.forEach((square) => square.startAnimation());
  }, []);

  const resetAnimation = useCallback(() => {
    isAnimatingRef.current = false;
    squareRefs.current.forEach((square) => square.resetAnimation());
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
    startAnimation();
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
      <Animated.View style={[styles.card, pressAnimatedStyle]}>
        <View style={styles.dayLabels}>
          {weekdayLabels.map((label) => (
            <Text key={label} numberOfLines={1} style={styles.dayLabel}>
              {label}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {weeks.map((week, weekIndex) => (
            <View key={week[0].dateKey} style={styles.week}>
              {week.map((day, dayIndex) =>
                day.inRange ? (
                  <ActivitySquare
                    dayIndex={dayIndex}
                    key={day.dateKey}
                    level={data[day.dateKey] ?? 0}
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
      </Animated.View>
    </Pressable>
  );
}

function buildWeekdayLabels(locale: string): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const monday = normalizeLocalDate(new Date(2024, 0, 1)); // a known Monday

  return Array.from({ length: activityCalendarRowCount }, (_, dayIndex) =>
    formatter.format(addCalendarDays(monday, dayIndex)),
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'flex-start',
    backgroundColor: homeActivityCalendar.cardColor,
    borderCurve: 'continuous',
    borderRadius: homeActivityCalendar.cardRadius,
    boxShadow: homeActivityCalendar.cardShadow,
    flexDirection: 'row',
    padding: homeActivityCalendar.cardPadding,
  },
  dayLabel: {
    color: homeActivityCalendar.dayLabelColor,
    fontSize: homeActivityCalendar.dayLabelFontSize,
    height: homeActivityCalendar.cellSize,
    lineHeight: homeActivityCalendar.cellSize,
    width: homeActivityCalendar.dayLabelWidth,
  },
  dayLabels: {
    gap: homeActivityCalendar.cellGap,
    marginRight: homeActivityCalendar.dayLabelGap,
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
  week: {
    gap: homeActivityCalendar.cellGap,
  },
});
