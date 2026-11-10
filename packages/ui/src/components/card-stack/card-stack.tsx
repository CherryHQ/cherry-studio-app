import { type ReactNode, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';

export type CardStackProps<T> = {
  items: readonly T[];
  index: number;
  onIndexChange(index: number): void;
  layout?: 'fill' | 'compact';
  renderItem(item: T, frame: { width: number; height: number; isFront: boolean }): ReactNode;
  labels: { previous: string; next: string; page(index: number, count: number): string };
};

const CARD_GAP = 12;
const CARD_WIDTH = 290;
const CARD_ASPECT_RATIO = 290 / 388;

/** Upright previews. Fixed slots retain the foreground browser while the selected page changes. */
export function CardStack<T>({
  items,
  index,
  onIndexChange,
  layout = 'fill',
  renderItem,
  labels,
}: CardStackProps<T>) {
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const count = items.length;
  const activeIndex = count ? ((index % count) + count) % count : 0;
  const isFilled = layout === 'fill' && count === 1;
  const width = Math.max(
    1,
    isFilled
      ? bounds.width
      : Math.min(CARD_WIDTH, bounds.width - 64, bounds.height * CARD_ASPECT_RATIO),
  );
  const height = isFilled ? Math.max(1, bounds.height) : width / CARD_ASPECT_RATIO;
  const changeIndex = (next: number) => {
    if (count) onIndexChange(((next % count) + count) % count);
  };
  const gesture = useMemo(
    () =>
      Gesture.Exclusive(
        Gesture.Fling()
          .direction(Directions.LEFT)
          .enabled(count > 1)
          .runOnJS(true)
          .onEnd((_, success) => {
            if (success) onIndexChange((activeIndex + 1) % count);
          }),
        Gesture.Fling()
          .direction(Directions.RIGHT)
          .enabled(count > 1)
          .runOnJS(true)
          .onEnd((_, success) => {
            if (success) onIndexChange((activeIndex + count - 1) % count);
          }),
      ),
    [activeIndex, count, onIndexChange],
  );
  const firstDot = Math.max(0, Math.min(activeIndex - 3, count - 7));
  const dotPages = Array.from({ length: Math.min(7, count) }, (_, offset) => firstDot + offset);
  return (
    <View className="min-h-0 flex-1 gap-4">
      <GestureDetector gesture={gesture}>
        <View
          className="min-h-0 flex-1 overflow-hidden"
          onLayout={({ nativeEvent: { layout } }) =>
            setBounds((current) =>
              current.width === layout.width && current.height === layout.height
                ? current
                : { width: layout.width, height: layout.height },
            )
          }
        >
          {bounds.width > 0 && count > 0
            ? (count > 1 ? [-1, 0, 1] : [0]).map((offset) => {
                const isFront = offset === 0;
                return (
                  <View
                    key={offset}
                    accessibilityElementsHidden={!isFront}
                    importantForAccessibility={isFront ? 'auto' : 'no-hide-descendants'}
                    pointerEvents={isFront ? 'auto' : 'none'}
                    className="absolute overflow-hidden rounded-3xl bg-card dark:bg-background"
                    style={{
                      width,
                      height,
                      left:
                        (bounds.width - width) / 2 +
                        offset * (width + CARD_GAP) +
                        (offset < 0 ? -26 : 0),
                      opacity: isFront ? 1 : 0.9,
                      top: (bounds.height - height) / 2,
                    }}
                  >
                    {renderItem(items[(activeIndex + offset + count) % count], {
                      width,
                      height,
                      isFront,
                    })}
                    <View
                      className="absolute inset-0 rounded-3xl dark:border dark:border-border"
                      pointerEvents="none"
                    />
                  </View>
                );
              })
            : null}
        </View>
      </GestureDetector>
      {count > 1 ? (
        <View
          accessibilityActions={[
            { name: 'decrement', label: labels.previous },
            { name: 'increment', label: labels.next },
          ]}
          accessibilityLabel={labels.page(activeIndex + 1, count)}
          accessibilityRole="adjustable"
          accessibilityValue={{ min: 1, max: count, now: activeIndex + 1 }}
          onAccessibilityAction={({ nativeEvent }) =>
            changeIndex(activeIndex + (nativeEvent.actionName === 'increment' ? 1 : -1))
          }
          className="h-1.5 flex-row items-center justify-center gap-1.5"
        >
          {dotPages.map((page) => (
            <Pressable
              key={page}
              accessible={false}
              hitSlop={8}
              onPress={() => changeIndex(page)}
              className={
                page === activeIndex
                  ? 'h-1.5 w-[18px] rounded-full bg-foreground'
                  : 'size-1.5 rounded-full bg-border-strong'
              }
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
