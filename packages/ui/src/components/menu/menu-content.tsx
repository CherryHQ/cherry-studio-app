import CheckIcon from '@cherrystudio/app-icons/icons/check';
import GitForkIcon from '@cherrystudio/app-icons/icons/git-fork';
import { useEffect, useId, useState } from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from '../../utils';
import { Portal } from '../portal';
import { menuCloseMotion, menuOpenMotion } from './menu-motion';
import { MenuPanel, menuRowClassName } from './menu-panel';
import type { MenuItem } from './menu.types';

export type MenuAnchor = { height: number; pageX: number; pageY: number; width: number };

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
  onClose: () => void;
  onClosed: () => void;
}) {
  const portalName = useId();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const isReducedMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const [panelHeight, setPanelHeight] = useState(0);
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

  // Measure the full panel first, then reveal it through an expanding clip.
  // Closing retains the portal until completion; a re-open cancels that teardown.
  useEffect(() => {
    if (isOpen) {
      if (panelHeight > 0) {
        progress.set(isReducedMotion ? 1 : withTiming(1, menuOpenMotion));
      }
      return;
    }

    if (isReducedMotion) {
      progress.set(0);
      onClosed();
      return;
    }

    progress.set(
      withTiming(0, menuCloseMotion, (finished) => {
        if (finished) {
          runOnJS(onClosed)();
        }
      }),
    );
  }, [isOpen, isReducedMotion, onClosed, panelHeight, progress]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [isOpen, onClose]);

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
    <Portal name={`menu-${portalName}`}>
      <Pressable
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onPress={onClose}
        pointerEvents={isOpen ? 'auto' : 'none'}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        accessibilityElementsHidden={!isOpen}
        accessibilityViewIsModal
        className="absolute"
        importantForAccessibility={isOpen ? 'yes' : 'no-hide-descendants'}
        onAccessibilityEscape={onClose}
        pointerEvents={isOpen ? 'auto' : 'none'}
        role="menu"
        style={containerStyle}
      >
        <MenuPanel
          contentStyle={{
            position: 'absolute',
            width: menuWidth,
            ...(opensAbove ? { bottom: 0 } : { top: 0 }),
          }}
          isOpen={isOpen}
          onLayout={({ nativeEvent }) => {
            const nextHeight = Math.ceil(nativeEvent.layout.height);
            setPanelHeight((current) =>
              Math.abs(current - nextHeight) > 1 ? nextHeight : current,
            );
          }}
          progress={progress}
        >
          <ScrollView
            contentContainerClassName="gap-0.5"
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: Math.max(0, maxHeight - 16) }}
          >
            {items.map((item) => (
              <Pressable
                accessibilityLabel={item.label}
                accessibilityRole={item.checked === undefined ? 'menuitem' : 'checkbox'}
                accessibilityState={{ checked: item.checked, disabled: Boolean(item.disabled) }}
                className={cn(menuRowClassName, 'min-h-11 py-2 disabled:opacity-40')}
                disabled={item.disabled}
                key={item.id}
                onPress={() => {
                  if (!item.disabled && isOpen) {
                    onClose();
                    item.onPress();
                  }
                }}
              >
                {item.icon === 'branch' ? (
                  <GitForkIcon
                    className={cn(
                      'size-5',
                      item.destructive ? 'text-destructive' : 'text-foreground',
                    )}
                  />
                ) : null}
                <Text
                  className={cn(
                    'min-w-0 flex-1 text-base',
                    item.destructive ? 'text-destructive' : 'text-foreground',
                  )}
                >
                  {item.label}
                </Text>
                {item.checked !== undefined ? (
                  <View accessible={false} className="size-5">
                    {item.checked ? <CheckIcon className="size-5 text-foreground" /> : null}
                  </View>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </MenuPanel>
      </Animated.View>
    </Portal>
  );
}
