import { type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { focusMenuTarget } from './menu-focus';
import { MenuInteraction, type MenuInteractionValue } from './menu-interaction';

/**
 * The system modal isolates background accessibility and owns Back/Escape.
 * Unlike a portal store, it also preserves the caller's theme and React context.
 * Keep it mounted until native dismissal before launching a picker or navigating.
 */
export function MenuOverlay({
  children,
  isOpen,
  isVisible,
  onClose,
  onClosed,
  testID,
}: {
  children: ReactNode;
  isOpen: boolean;
  isVisible: boolean;
  onClose: MenuInteractionValue['close'];
  onClosed: () => void;
  testID?: string;
}) {
  const items = useRef(new Set<View>());
  const isActive = useRef(isOpen);
  const focusFrame = useRef<number | undefined>(undefined);
  const registerItem = useCallback((item: View) => {
    items.current.add(item);
    return () => {
      items.current.delete(item);
    };
  }, []);
  const interaction = useMemo(
    () => ({ close: onClose, isOpen, registerItem }),
    [isOpen, onClose, registerItem],
  );

  useEffect(() => {
    // RN's Android Modal has no onDismiss event. Its native dialog is removed
    // when visible becomes false; wait for that commit before completing close.
    if (!isVisible && Platform.OS === 'android') {
      const frame = requestAnimationFrame(onClosed);
      return () => cancelAnimationFrame(frame);
    }
  }, [isVisible, onClosed]);

  useEffect(
    () => () => {
      if (focusFrame.current !== undefined) {
        cancelAnimationFrame(focusFrame.current);
      }
    },
    [],
  );

  useEffect(() => {
    isActive.current = isOpen;
    if (!isOpen && focusFrame.current !== undefined) {
      cancelAnimationFrame(focusFrame.current);
    }
  }, [isOpen]);

  return (
    <Modal
      animationType="none"
      hardwareAccelerated
      navigationBarTranslucent
      onDismiss={onClosed}
      onRequestClose={() => {
        if (isOpen) onClose();
      }}
      onShow={() => {
        focusFrame.current = requestAnimationFrame(() => {
          if (isActive.current) focusMenuTarget(items.current.values().next().value ?? null);
        });
      }}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={isVisible}
    >
      <GestureHandlerRootView style={styles.root}>
        <MenuInteraction value={interaction}>
          <Pressable
            accessibilityElementsHidden
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            onPress={() => {
              if (isOpen) onClose();
            }}
            style={StyleSheet.absoluteFill}
            testID={testID ? `${testID}-backdrop` : undefined}
          />
          <View
            accessibilityElementsHidden={!isOpen}
            accessibilityViewIsModal
            importantForAccessibility={isOpen ? 'auto' : 'no-hide-descendants'}
            onAccessibilityEscape={() => {
              if (isOpen) onClose();
            }}
            pointerEvents={isOpen ? 'box-none' : 'none'}
            style={StyleSheet.absoluteFill}
          >
            {children}
          </View>
        </MenuInteraction>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
