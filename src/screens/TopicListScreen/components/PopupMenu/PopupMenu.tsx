import { cn } from 'heroui-native/utils';
import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, Text } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import type { PopupMenuProps } from './types';

const menuWidth = 176;
const menuRowHeight = 44;
const menuEntering = FadeIn.duration(160)
  .withInitialValues({ opacity: 0 })
  .reduceMotion(ReduceMotion.Never);

export const PopupMenu = memo(function PopupMenu({
  visible,
  anchorRef,
  containerRef,
  items,
  onClose,
  closeAccessibilityLabel,
}: PopupMenuProps) {
  const isMountedRef = useRef(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      setMenuPosition(null);
      return;
    }
    if (!anchorRef.current) {
      return;
    }

    const menuHeight = items.length * menuRowHeight;

    anchorRef.current.measureInWindow((rowX, rowY, rowWidth, rowHeight) => {
      containerRef.current?.measureInWindow((containerX, containerY, _containerWidth, height) => {
        if (!isMountedRef.current) {
          return;
        }

        const localX = rowX - containerX;
        const localY = rowY - containerY;
        const x =
          localX + Math.min(rowWidth - menuWidth - 8, Math.max(8, rowWidth / 2 - menuWidth / 2));
        const fitsBelow = localY + rowHeight + menuHeight + 8 <= height;
        const y = fitsBelow ? localY + rowHeight + 4 : localY - menuHeight - 4;
        setMenuPosition({ x, y });
      });
    });
  }, [anchorRef, containerRef, items.length, visible]);

  if (!visible || !menuPosition) {
    return null;
  }

  return (
    <>
      <Pressable
        accessibilityLabel={closeAccessibilityLabel}
        accessibilityRole="button"
        className="absolute inset-0 z-40"
        onPress={onClose}
      />
      <Animated.View
        accessibilityRole="menu"
        className="absolute z-50 overflow-hidden rounded-xl bg-overlay shadow-lg"
        entering={menuEntering}
        style={{ left: menuPosition.x, top: menuPosition.y, width: menuWidth }}
      >
        {items.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="menuitem"
            className="flex-row items-center gap-3 px-4 py-3 active:opacity-60"
            onPress={item.onPress}
          >
            {item.icon}
            <Text className={cn('text-sm', item.destructive ? 'text-danger' : 'text-foreground')}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </Animated.View>
    </>
  );
});
