import ArrowLeftIcon from '@cherrystudio/app-icons/icons/arrow-left';
import XIcon from '@cherrystudio/app-icons/icons/x';
import {
  BottomSheetProvider as NativeBottomSheetProvider,
  type Detent,
  ModalBottomSheet,
  programmatic,
} from '@swmansion/react-native-bottom-sheet';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';

import { cn } from '../../utils';

const CLOSED_INDEX = 0;
const OPEN_INDEX = 1;
const TOP_INSET = 12;
const MAX_CARD_WIDTH = 720;
const TOP_CORNER_RADIUS = 32;
const KEYBOARD_GAP = 12;
const HEIGHT_RATIOS = {
  compact: 0.4,
  full: 1,
  large: 0.8,
  medium: 0.6,
} as const;

export type BottomSheetSize = keyof typeof HEIGHT_RATIOS;
export type BottomSheetSizes = readonly [BottomSheetSize, ...BottomSheetSize[]];

export type BottomSheetBackAction = {
  accessibilityLabel: string;
  onPress: () => void;
};

type BottomSheetBaseProps = {
  /** Lift the sheet with the keyboard, frame by frame, so its inputs and footer stay above it. */
  avoidKeyboard?: boolean;
  backAction?: BottomSheetBackAction;
  children: ReactNode;
  closeAction?: { accessibilityLabel: string };
  dismissible?: boolean;
  footer?: ReactNode;
  headerAction?: ReactNode;
  onClose: () => void;
  open: boolean;
  testID?: string;
  title: string;
};

export type BottomSheetProps = BottomSheetBaseProps &
  (
    | {
        height: number;
        size?: never;
        sizes?: never;
      }
    | {
        height?: never;
        size: BottomSheetSize;
        sizes?: never;
      }
    | {
        height?: never;
        size?: never;
        sizes: BottomSheetSizes;
      }
  );

export function BottomSheetProvider({ children }: { children: ReactNode }) {
  return <NativeBottomSheetProvider>{children}</NativeBottomSheetProvider>;
}

/**
 * The single mobile sheet shell. Product code supplies content; this component
 * owns presentation, dismissal, safe areas, and the same visual language on
 * iOS and Android.
 */
export function BottomSheet(props: BottomSheetProps) {
  const {
    avoidKeyboard = false,
    backAction,
    children,
    closeAction,
    dismissible = true,
    footer,
    headerAction,
    onClose,
    open,
    testID,
    title,
  } = props;
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.max(0, Math.min(MAX_CARD_WIDTH, windowWidth - insets.left - insets.right));
  const scrimStyle = useResolveClassNames('bg-scrim');
  const scrimColor =
    typeof scrimStyle.backgroundColor === 'string' ? scrimStyle.backgroundColor : undefined;
  const availableCardHeight = Math.max(0, windowHeight - insets.top - TOP_INSET);
  const { height, size, sizes } = props;
  const { cardHeight, detents } = useMemo(
    () => resolveSheetHeights(availableCardHeight, dismissible, height, size, sizes),
    [availableCardHeight, dismissible, height, size, sizes],
  );
  const hasFooter = footer != null;
  // A handle promises a drag; a sheet that can neither close nor resize offers none.
  const isDraggable = dismissible || (!avoidKeyboard && detents.length > 2);
  const bottomInset = hasFooter ? Math.max(insets.bottom, 16) : insets.bottom;
  const isCloseActionVisible = Boolean(closeAction && !backAction);
  const [index, setIndex] = useState(open ? OPEN_INDEX : CLOSED_INDEX);
  const [previousOpen, setPreviousOpen] = useState(open);
  const hasNotifiedCloseRef = useRef(false);

  if (open !== previousOpen) {
    setPreviousOpen(open);
    setIndex(open ? OPEN_INDEX : CLOSED_INDEX);
  }

  useEffect(() => {
    if (open) {
      hasNotifiedCloseRef.current = false;
    }
  }, [open]);

  const requestClose = useCallback(() => {
    if (!dismissible) {
      return;
    }

    Keyboard.dismiss();
    setIndex(CLOSED_INDEX);
  }, [dismissible]);

  const handleHardwareBackPress = useCallback(() => {
    if (backAction) {
      backAction.onPress();
    } else {
      requestClose();
    }

    return true;
  }, [backAction, requestClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', handleHardwareBackPress);

    return () => subscription.remove();
  }, [handleHardwareBackPress, open]);

  const handleIndexChange = useCallback((nextIndex: number) => {
    setIndex(nextIndex);
  }, []);
  const handleSettle = useCallback(
    (nextIndex: number) => {
      if (nextIndex !== CLOSED_INDEX || hasNotifiedCloseRef.current || !dismissible || !open) {
        return;
      }

      hasNotifiedCloseRef.current = true;
      Keyboard.dismiss();
      onClose();
    },
    [dismissible, onClose, open],
  );

  return (
    <ModalBottomSheet
      // A keyboard-avoiding card animates its own height, which the content detent follows.
      animateContentHeight={!avoidKeyboard}
      detents={avoidKeyboard ? [detents[CLOSED_INDEX], 'content'] : detents}
      index={index}
      onIndexChange={handleIndexChange}
      onSettle={handleSettle}
      scrimColor={scrimColor}
    >
      <SheetLayout
        availableCardHeight={availableCardHeight}
        avoidKeyboard={avoidKeyboard}
        bottomInset={bottomInset}
        cardHeight={cardHeight}
        style={[
          styles.layout,
          { width: '100%', paddingLeft: insets.left, paddingRight: insets.right },
        ]}
      >
        {/* The native host keeps its full-window scrim. The transparent space
            beside a bounded card must dismiss just like the scrim above it. */}
        <Pressable
          accessibilityElementsHidden
          accessible={false}
          disabled={!open || !dismissible}
          importantForAccessibility="no-hide-descendants"
          onPress={requestClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityElementsHidden={!open}
          accessibilityViewIsModal
          className="overflow-hidden border-continuous bg-background dark:border dark:border-border dark:bg-popover"
          importantForAccessibility={open ? 'yes' : 'no-hide-descendants'}
          onAccessibilityEscape={dismissible ? requestClose : undefined}
          style={[
            styles.card,
            avoidKeyboard
              ? { flex: 1, width: cardWidth }
              : { height: cardHeight, width: cardWidth },
          ]}
          testID={testID}
        >
          <View className="absolute inset-0 dark:bg-secondary" pointerEvents="none" />
          <View accessibilityElementsHidden className="items-center pt-3" pointerEvents="none">
            <View
              className={cn('h-1 w-9 rounded-full', isDraggable && 'bg-border-strong')}
              testID={isDraggable ? 'bottom-sheet-handle' : undefined}
            />
          </View>
          <View className="min-h-14 flex-row items-center px-5 py-1.5">
            {backAction ? (
              <Pressable
                accessibilityLabel={backAction.accessibilityLabel}
                accessibilityRole="button"
                className="-ml-2 mr-2 size-11 items-center justify-center rounded-full active:bg-secondary"
                hitSlop={4}
                onPress={backAction.onPress}
              >
                <ArrowLeftIcon className="size-6 text-foreground" />
              </Pressable>
            ) : closeAction ? (
              <View className="min-w-11 flex-1 items-start">
                <Pressable
                  accessibilityLabel={closeAction.accessibilityLabel}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !dismissible }}
                  className="size-11 items-center justify-center rounded-full active:bg-secondary disabled:opacity-40"
                  disabled={!dismissible}
                  onPress={requestClose}
                >
                  <XIcon className="size-6 text-foreground" />
                </Pressable>
              </View>
            ) : null}
            <Text
              accessibilityRole="header"
              className={cn(
                'min-w-0 font-semibold text-foreground text-lg',
                isCloseActionVisible ? 'shrink px-2 text-center' : 'flex-1',
              )}
              numberOfLines={2}
            >
              {title}
            </Text>
            {isCloseActionVisible ? (
              <View className="min-w-11 flex-1 items-end">{headerAction}</View>
            ) : headerAction ? (
              <View className="ml-2">{headerAction}</View>
            ) : null}
          </View>
          <View
            className="min-h-0 flex-1"
            style={hasFooter ? undefined : { paddingBottom: insets.bottom }}
          >
            {children}
          </View>
          {hasFooter ? (
            <View
              className="border-t border-border px-4 pt-3"
              style={{ paddingBottom: Math.max(insets.bottom, 16) }}
            >
              {footer}
            </View>
          ) : null}
          {avoidKeyboard ? <KeyboardSpacer bottomInset={bottomInset} /> : null}
        </View>
      </SheetLayout>
    </ModalBottomSheet>
  );
}

type SheetLayoutProps = {
  availableCardHeight: number;
  avoidKeyboard: boolean;
  bottomInset: number;
  cardHeight: number;
  children: ReactNode;
  style: StyleProp<ViewStyle>;
};

function SheetLayout({ avoidKeyboard, cardHeight, children, style, ...props }: SheetLayoutProps) {
  return avoidKeyboard ? (
    <KeyboardSheetLayout cardHeight={cardHeight} style={style} {...props}>
      {children}
    </KeyboardSheetLayout>
  ) : (
    <View style={[style, { height: cardHeight }]}>{children}</View>
  );
}

/** The card grows by the lift until it reaches the top inset; past that its body shrinks. */
function KeyboardSheetLayout({
  availableCardHeight,
  bottomInset,
  cardHeight,
  children,
  style,
}: Omit<SheetLayoutProps, 'avoidKeyboard'>) {
  const { height, progress } = useReanimatedKeyboardAnimation();
  const animatedStyle = useAnimatedStyle(() => ({
    height: Math.min(
      cardHeight + keyboardLift(height.value, progress.value, bottomInset),
      availableCardHeight,
    ),
  }));
  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

/** Fills the card behind the keyboard so the footer rides on top of it. */
function KeyboardSpacer({ bottomInset }: { bottomInset: number }) {
  const { height, progress } = useReanimatedKeyboardAnimation();
  const animatedStyle = useAnimatedStyle(() => ({
    height: keyboardLift(height.value, progress.value, bottomInset),
  }));
  return <Animated.View style={animatedStyle} />;
}

/**
 * The keyboard covers the bottom safe area, so the lift replaces that inset with a small gap.
 * `height` is negative while the keyboard is visible.
 */
function keyboardLift(height: number, progress: number, bottomInset: number): number {
  'worklet';
  return Math.max(0, -height - progress * (bottomInset - KEYBOARD_GAP));
}

function resolveSheetHeights(
  availableCardHeight: number,
  dismissible: boolean,
  height: number | undefined,
  size: BottomSheetSize | undefined,
  sizes: BottomSheetSizes | undefined,
) {
  const requestedCardHeights =
    height !== undefined
      ? [height]
      : size !== undefined
        ? [Math.round(availableCardHeight * HEIGHT_RATIOS[size])]
        : (sizes ?? []).map((sheetSize) =>
            Math.round(availableCardHeight * HEIGHT_RATIOS[sheetSize]),
          );
  const cardHeights = requestedCardHeights
    .map((requestedHeight) => Math.max(0, Math.min(requestedHeight, availableCardHeight)))
    .sort((left, right) => left - right)
    .filter((height, index, heights) => index === 0 || height !== heights[index - 1]);
  const cardHeight = cardHeights.at(-1) ?? 0;
  const closedDetent = dismissible ? 0 : programmatic(0);
  const detents: Detent[] = [closedDetent, ...cardHeights];

  return { cardHeight, detents };
}

const styles = StyleSheet.create({
  card: {
    borderCurve: 'continuous',
    borderTopLeftRadius: TOP_CORNER_RADIUS,
    borderTopRightRadius: TOP_CORNER_RADIUS,
  },
  layout: {
    alignItems: 'center',
  },
});
