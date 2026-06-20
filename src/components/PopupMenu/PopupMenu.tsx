import { cn } from 'heroui-native/utils';
import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { PopupMenuProps } from './types';

const menuWidth = 176;

export const PopupMenu = memo(function PopupMenu({
  visible,
  anchorRef,
  containerRef,
  items,
  onClose,
  closeAccessibilityLabel,
}: PopupMenuProps) {
  const isMountedRef = useRef(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      setMenuPos(null);
      return;
    }
    if (!anchorRef.current) return;

    const computedMenuHeight = items.length * 48;

    anchorRef.current.measureInWindow((rx, ry, rw, rh) => {
      containerRef.current?.measureInWindow((cx, cy, _cw, _ch) => {
        if (!isMountedRef.current) return;

        const localX = rx - cx;
        const localY = ry - cy;
        const x = localX + Math.min(rw - menuWidth - 8, Math.max(8, rw / 2 - menuWidth / 2));
        const below = localY + rh + computedMenuHeight + 8 <= _ch;
        const menuY = below ? localY + rh + 4 : localY - computedMenuHeight - 4;
        setMenuPos({ x, y: menuY });
      });
    });
  }, [visible, anchorRef, containerRef, items.length]);

  if (!visible || !menuPos) return null;

  return (
    <>
      <Pressable
        accessibilityLabel={closeAccessibilityLabel}
        className="absolute inset-0 z-40"
        onPress={onClose}
      />
      <View
        accessibilityRole="menu"
        className="absolute z-50 overflow-hidden rounded-xl bg-overlay shadow-lg"
        style={{ top: menuPos.y, left: menuPos.x, width: menuWidth }}
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
      </View>
    </>
  );
});
