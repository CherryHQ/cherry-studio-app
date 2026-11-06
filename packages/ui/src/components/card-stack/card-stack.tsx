import ChevronLeftIcon from '@cherrystudio/app-icons/icons/chevron-left';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { type ReactNode, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Button } from '../button';

export type CardStackProps<T> = {
  items: readonly T[];
  index: number;
  onIndexChange(index: number): void;
  /** Fill the available frame for one item; collections retain the compact deck. */
  layout?: 'stack' | 'fill';
  renderItem(item: T, frame: { width: number; height: number; isFront: boolean }): ReactNode;
  labels: { previous: string; next: string; page(index: number, count: number): string };
};

/** A small, controlled preview deck. Selection, conversion and delivery stay with the caller. */
export function CardStack<T>({
  items,
  index,
  onIndexChange,
  layout = 'stack',
  renderItem,
  labels,
}: CardStackProps<T>) {
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const count = items.length;
  const activeIndex = count ? ((index % count) + count) % count : 0;
  const isFilled = layout === 'fill' && count === 1;
  const width = Math.max(
    1,
    isFilled ? bounds.width : Math.min(280, bounds.width - 72, (bounds.height - 56) * 0.77),
  );
  const height = isFilled ? Math.max(1, bounds.height) : width / 0.77;
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
  return (
    <View className="min-h-0 flex-1">
      <GestureDetector gesture={gesture}>
        <View
          className="min-h-0 flex-1 items-center justify-center"
          onLayout={({ nativeEvent: { layout } }) => {
            setBounds((current) =>
              current.width === layout.width && current.height === layout.height
                ? current
                : { width: layout.width, height: layout.height },
            );
          }}
        >
          {bounds.width > 0 && count
            ? [2, 1, 0]
                .filter((offset) => offset < count)
                .map((offset) => {
                  const item = items[(activeIndex + offset) % count];
                  const isFront = offset === 0;
                  return (
                    <View
                      key={offset}
                      accessibilityElementsHidden={!isFront}
                      importantForAccessibility={isFront ? 'auto' : 'no-hide-descendants'}
                      pointerEvents={isFront ? 'auto' : 'none'}
                      className="absolute overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-md shadow-constant-black/15"
                      style={{
                        width,
                        height,
                        zIndex: 3 - offset,
                        transform: [
                          { translateX: offset === 2 ? -11 : offset === 1 ? 12 : 0 },
                          { translateY: offset === 2 ? -3 : 0 },
                          { rotate: offset === 2 ? '-7deg' : offset === 1 ? '6deg' : '0deg' },
                        ],
                      }}
                    >
                      {renderItem(item, { width, height, isFront })}
                    </View>
                  );
                })
            : null}
        </View>
      </GestureDetector>
      {count > 1 ? (
        <View className="h-11 flex-row items-center justify-center gap-2">
          <Button
            accessibilityLabel={labels.previous}
            icon={<ChevronLeftIcon size={16} />}
            onPress={() => onIndexChange((activeIndex + count - 1) % count)}
            size="sm"
            variant="ghost"
          />
          <Text
            accessibilityLabel={labels.page(activeIndex + 1, count)}
            className="min-w-12 text-center font-mono text-muted-foreground text-xs"
          >
            {activeIndex + 1} / {count}
          </Text>
          <Button
            accessibilityLabel={labels.next}
            icon={<ChevronRightIcon size={16} />}
            onPress={() => onIndexChange((activeIndex + 1) % count)}
            size="sm"
            variant="ghost"
          />
        </View>
      ) : !isFilled ? (
        <View className="h-11" />
      ) : null}
    </View>
  );
}
