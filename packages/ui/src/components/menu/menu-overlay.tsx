import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BackHandler, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import {
  GestureHandlerRootView,
  Pressable as GesturePressable,
} from 'react-native-gesture-handler';
import { OverKeyboardView } from 'react-native-keyboard-controller';

import { useNavigationOverlay } from '../portal/overlay-navigation';
import { focusMenuTarget } from './menu-focus';
import { MenuInteraction, type MenuInteractionValue } from './menu-interaction';

type MenuOverlayProps = {
  children: ReactNode;
  isOpen: boolean;
  isVisible: boolean;
  onClose: MenuInteractionValue['close'];
  onClosed: () => void;
  testID?: string;
};

type MenuOverlayHostProps = {
  children: ReactNode;
  onDismiss: () => void;
  onRequestClose: () => void;
  onShow: () => void;
  visible: boolean;
};

/** Android menus preserve focus so presentation cannot synthesize keyboard scrolling. */
export function MenuOverlay(props: MenuOverlayProps) {
  if (Platform.OS === 'android') return <KeyboardMenuOverlay {...props} />;
  return <MenuOverlayRoot {...props} host={NativeMenuOverlayHost} />;
}

/** Composer overlays keep the editor's native focus and current keyboard state. */
export function KeyboardMenuOverlay(props: MenuOverlayProps) {
  return (
    <MenuOverlayRoot
      {...props}
      host={KeyboardMenuOverlayHost}
      shouldUseNativePresses={Platform.OS === 'android'}
    />
  );
}

function MenuOverlayRoot({
  children,
  host: Host,
  isOpen,
  isVisible,
  onClose,
  onClosed,
  shouldUseNativePresses = false,
  testID,
}: MenuOverlayProps & {
  host: ComponentType<MenuOverlayHostProps>;
  shouldUseNativePresses?: boolean;
}) {
  const [isPresented, setIsPresented] = useState(isVisible);
  if (isVisible && !isPresented) setIsPresented(true);
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
    () => ({ close: onClose, isOpen, registerItem, shouldUseNativePresses }),
    [isOpen, onClose, registerItem, shouldUseNativePresses],
  );
  const BackdropPressable = shouldUseNativePresses ? GesturePressable : Pressable;

  const requestClose = useCallback(() => {
    if (isActive.current) onClose();
  }, [onClose]);
  useNavigationOverlay(isVisible || isPresented, requestClose);
  const handleDismiss = useCallback(() => {
    if (!isOpen) setIsPresented(false);
    onClosed();
  }, [isOpen, onClosed]);
  const handleShow = useCallback(() => {
    focusFrame.current = requestAnimationFrame(() => {
      if (isActive.current) focusMenuTarget(items.current.values().next().value ?? null);
    });
  }, []);

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
    <Host
      onDismiss={handleDismiss}
      onRequestClose={requestClose}
      onShow={handleShow}
      visible={isVisible}
    >
      <GestureHandlerRootView accessibilityViewIsModal style={styles.root}>
        <MenuInteraction value={interaction}>
          <BackdropPressable
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
    </Host>
  );
}

function NativeMenuOverlayHost({ onDismiss, visible, ...props }: MenuOverlayHostProps) {
  return (
    <Modal
      {...props}
      animationType="none"
      hardwareAccelerated
      navigationBarTranslucent
      onDismiss={onDismiss}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      supportedOrientations={[
        'portrait',
        'portrait-upside-down',
        'landscape-left',
        'landscape-right',
      ]}
      transparent
      visible={visible}
    />
  );
}

function KeyboardMenuOverlayHost({
  children,
  onDismiss,
  onRequestClose,
  onShow,
  visible,
}: MenuOverlayHostProps) {
  useEffect(() => {
    // This host has no native presentation animation or dismissal event. Its
    // visible commit attaches/removes the overlay without moving editor focus.
    const frame = requestAnimationFrame(visible ? onShow : onDismiss);
    return () => cancelAnimationFrame(frame);
  }, [onDismiss, onShow, visible]);

  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onRequestClose();
      return true;
    });
    return () => subscription.remove();
  }, [onRequestClose, visible]);

  return <OverKeyboardView visible={visible}>{children}</OverKeyboardView>;
}

const styles = StyleSheet.create({ root: { flex: 1 } });
