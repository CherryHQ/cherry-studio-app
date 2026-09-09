import CheckIcon from '@cherrystudio/app-icons/icons/check';
import GitForkIcon from '@cherrystudio/app-icons/icons/git-fork';
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from '../../utils';
import type { MenuInteractionValue } from './menu-interaction';
import { MenuOverlay } from './menu-overlay';
import { MenuPanel } from './menu-panel';
import { MenuRow } from './menu-row';
import type { MenuAnchor, MenuItem } from './menu.types';
import { useMenuMotion } from './use-menu-motion';

/** Trigger placement and dismissal around the composer's shared menu panel. */
export function MenuContent({
  anchor,
  isOpen,
  items,
  onClose,
  onClosed,
}: {
  anchor: MenuAnchor;
  isOpen: boolean;
  items: readonly MenuItem[];
  onClose: MenuInteractionValue['close'];
  onClosed: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const [panelHeight, setPanelHeight] = useState(0);
  const { progress, isVisible } = useMenuMotion(isOpen, panelHeight > 0);
  const topInset = insets.top + 16;
  const bottomEdge = height - insets.bottom - 16;
  const maxHeight = Math.max(0, Math.min(480, bottomEdge - topInset));
  const menuWidth = Math.max(0, Math.min(208, width - insets.left - insets.right - 32));
  const visibleHeight = Math.min(panelHeight, maxHeight);
  const spaceBelow = bottomEdge - anchor.pageY - anchor.height - 8;
  const opensAbove = spaceBelow < visibleHeight && anchor.pageY - topInset - 8 > spaceBelow;
  const top = Math.max(
    topInset,
    Math.min(
      opensAbove ? anchor.pageY - visibleHeight - 8 : anchor.pageY + anchor.height + 8,
      bottomEdge - visibleHeight,
    ),
  );
  const left = Math.max(
    insets.left + 16,
    Math.min(anchor.pageX + anchor.width - menuWidth, width - insets.right - 16 - menuWidth),
  );

  const containerStyle = useAnimatedStyle(() => {
    const animatedHeight = interpolate(progress.value, [0, 1], [32, visibleHeight]);
    return {
      height: animatedHeight,
      left,
      opacity: Math.min(progress.value * 4, 1),
      top: opensAbove ? top + visibleHeight - animatedHeight : top,
      width: interpolate(progress.value, [0, 1], [32, menuWidth]),
    };
  });

  return (
    <MenuOverlay isOpen={isOpen} isVisible={isVisible} onClose={onClose} onClosed={onClosed}>
      <Animated.View className="absolute" role="menu" style={containerStyle}>
        <MenuPanel
          contentStyle={{
            position: 'absolute',
            width: menuWidth,
            ...(opensAbove ? { bottom: 0 } : { top: 0 }),
          }}
          isOpen={isOpen}
          maxHeight={maxHeight}
          onLayout={({ nativeEvent }) => {
            const nextHeight = Math.ceil(nativeEvent.layout.height);
            setPanelHeight((current) =>
              Math.abs(current - nextHeight) > 1 ? nextHeight : current,
            );
          }}
          progress={progress}
        >
          {items.map((item) => (
            <MenuRow
              accessibilityRole={item.checked === undefined ? 'menuitem' : 'checkbox'}
              accessibilityState={{ checked: item.checked }}
              destructive={item.destructive}
              disabled={item.disabled}
              key={item.id}
              label={item.label}
              onPress={item.onPress}
              icon={
                item.icon === 'branch' ? (
                  <GitForkIcon
                    className={cn(
                      'size-5',
                      item.destructive ? 'text-destructive' : 'text-foreground',
                    )}
                  />
                ) : undefined
              }
              trailing={
                item.checked !== undefined ? (
                  <View accessible={false} className="size-5">
                    {item.checked ? <CheckIcon className="size-5 text-foreground" /> : null}
                  </View>
                ) : undefined
              }
            />
          ))}
        </MenuPanel>
      </Animated.View>
    </MenuOverlay>
  );
}
