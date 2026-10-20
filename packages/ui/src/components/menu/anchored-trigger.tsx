import type { ReactNode, RefObject } from 'react';
import { type AccessibilityState, Pressable, View, type ViewProps } from 'react-native';

import type { MenuAnchor } from './menu.types';

/** One accessible press target that measures presentation-only artwork before opening a panel. */
export function AnchoredTrigger({
  accessibilityLabel,
  accessibilityState,
  children,
  disabled = false,
  isOpen,
  onOpen,
  onStartShouldSetResponderCapture,
  testID,
  triggerRef,
}: {
  accessibilityLabel?: string;
  accessibilityState?: AccessibilityState;
  children: ReactNode;
  disabled?: boolean;
  isOpen: boolean;
  onOpen: (anchor: MenuAnchor) => void;
  onStartShouldSetResponderCapture?: ViewProps['onStartShouldSetResponderCapture'];
  testID?: string;
  triggerRef: RefObject<View | null>;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, disabled, expanded: isOpen }}
      className="active:opacity-60"
      collapsable={false}
      disabled={disabled}
      onPress={() => {
        if (disabled) {
          return;
        }
        triggerRef.current?.measureInWindow((pageX, pageY, width, height) => {
          onOpen({ height, pageX, pageY, width });
        });
      }}
      onStartShouldSetResponderCapture={disabled ? undefined : onStartShouldSetResponderCapture}
      ref={triggerRef}
      testID={testID}
    >
      <View
        accessibilityElementsHidden
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        {children}
      </View>
    </Pressable>
  );
}
