import ArrowLeftIcon from '@cherrystudio/app-icons/icons/arrow-left';
import XIcon from '@cherrystudio/app-icons/icons/x';
import {
  BottomSheetProvider as NativeBottomSheetProvider,
  type Detent,
  ModalBottomSheet,
  type PositionChangeEventData,
  programmatic,
} from '@swmansion/react-native-bottom-sheet';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  type NativeSyntheticEvent,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, {
  createAnimatedComponent,
  useAnimatedStyle,
  useEvent,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';

import { cn } from '../../utils';
import { useNavigationOverlay } from '../portal/overlay-navigation';

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
  /** Keep content above the keyboard; resizable sheets retain their selected height. */
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
  /** Omit for a preview-led sheet with only the drag handle above its content. */
  title?: string;
  /** Title-only sheets may center their heading without reserving action slots. */
  titleAlign?: 'start' | 'center';
  /**
   * `heading` (default) is a short name, truncated after two lines. `prompt` is a question or
   * request the user must read in full: body-sized and never truncated.
   */
  titleVariant?: 'heading' | 'prompt';
};

export type BottomSheetProps = BottomSheetBaseProps &
  (
    | {
        height: number;
        onSizeChange?: never;
        size?: never;
        sizes?: never;
      }
    | {
        height?: never;
        onSizeChange?: never;
        size: BottomSheetSize;
        sizes?: never;
      }
    | {
        height?: never;
        /** Controls the active height while retaining the other draggable sizes. */
        size?: BottomSheetSize;
        sizes: BottomSheetSizes;
        /** Reports a user-driven change to an open height. */
        onSizeChange?: (size: BottomSheetSize) => void;
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
    titleAlign,
    titleVariant = 'heading',
  } = props;
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.max(0, Math.min(MAX_CARD_WIDTH, windowWidth - insets.left - insets.right));
  const scrimStyle = useResolveClassNames('bg-scrim');
  const scrimColor =
    typeof scrimStyle.backgroundColor === 'string' ? scrimStyle.backgroundColor : undefined;
  const availableCardHeight = Math.max(0, windowHeight - insets.top - TOP_INSET);
  const { height, onSizeChange, size, sizes } = props;
  const { cardHeight, minCardHeight, detents, openIndex, sizeByIndex } = useMemo(
    () => resolveSheetHeights(availableCardHeight, dismissible, height, size, sizes),
    [availableCardHeight, dismissible, height, size, sizes],
  );
  const isResizable = detents.length > 2;
  // Resizable sheets keep their snap points; keyboard space only shrinks the body.
  const followsKeyboardContentHeight = avoidKeyboard && !isResizable;
  const position = useSharedValue(0);
  const handlePositionChange = useEvent<NativeSyntheticEvent<PositionChangeEventData>>(
    (event) => {
      'worklet';
      position.value = event.position;
    },
    ['onPositionChange'],
  );
  const visibleCardStyle = useAnimatedStyle(() => ({
    // Closing slides the smallest card out; expanding keeps its footer in view.
    height: Math.max(minCardHeight, Math.min(cardHeight, position.value)),
  }));
  const hasFooter = footer != null;
  const hasHeader = title != null || Boolean(backAction || closeAction || headerAction);
  // A handle promises a drag; a sheet that can neither close nor resize offers none.
  const isDraggable = dismissible || isResizable;
  const bottomInset = hasFooter ? Math.max(insets.bottom, 16) : insets.bottom;
  const isCloseActionVisible = Boolean(closeAction && !backAction);
  const resolvedTitleAlign = titleAlign ?? (isCloseActionVisible ? 'center' : 'start');
  const hasBalancedHeader =
    isCloseActionVisible || Boolean(backAction && resolvedTitleAlign === 'center');
  const [index, setIndex] = useState(open ? openIndex : CLOSED_INDEX);
  const [previousOpen, setPreviousOpen] = useState(open);
  const [previousOpenIndex, setPreviousOpenIndex] = useState(openIndex);
  const hasNotifiedCloseRef = useRef(false);

  if (open !== previousOpen || openIndex !== previousOpenIndex) {
    setPreviousOpen(open);
    setPreviousOpenIndex(openIndex);
    setIndex(open ? openIndex : CLOSED_INDEX);
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

  useNavigationOverlay(open, dismissible ? requestClose : undefined);

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

  const handleIndexChange = useCallback(
    (nextIndex: number) => {
      setIndex(nextIndex);
      if (nextIndex > CLOSED_INDEX) {
        if (avoidKeyboard && nextIndex < index) {
          Keyboard.dismiss();
        }
        const nextSize = sizeByIndex[nextIndex];
        if (nextSize) {
          onSizeChange?.(nextSize);
        }
      }
    },
    [avoidKeyboard, index, onSizeChange, sizeByIndex],
  );
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
      // UIKit menus need the presenting controller retained by the provider's view hierarchy.
      nativeOverlay={false}
      // Single-height keyboard avoidance animates the content height itself.
      animateContentHeight={!followsKeyboardContentHeight}
      detents={followsKeyboardContentHeight ? [detents[CLOSED_INDEX], 'content'] : detents}
      index={index}
      onIndexChange={handleIndexChange}
      onSettle={handleSettle}
      onPositionChange={isResizable ? handlePositionChange : undefined}
      wrapNativeView={createAnimatedComponent}
      scrimColor={scrimColor}
    >
      <SheetLayout
        availableCardHeight={availableCardHeight}
        avoidKeyboard={followsKeyboardContentHeight}
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
        <Animated.View
          accessibilityElementsHidden={!open}
          accessibilityViewIsModal
          className="overflow-hidden border-continuous bg-background dark:border dark:border-border dark:bg-popover"
          importantForAccessibility={open ? 'yes' : 'no-hide-descendants'}
          onAccessibilityEscape={dismissible ? requestClose : undefined}
          style={[
            styles.card,
            followsKeyboardContentHeight
              ? { flex: 1, width: cardWidth }
              : { height: cardHeight, width: cardWidth },
            isResizable ? visibleCardStyle : undefined,
          ]}
          testID={testID}
        >
          <View className="absolute inset-0 dark:bg-secondary" pointerEvents="none" />
          <View
            accessibilityElementsHidden
            className={cn('items-center pt-3', !hasHeader && 'pb-1.5')}
            pointerEvents="none"
          >
            <View
              className={cn('h-1 w-9 rounded-full', isDraggable && 'bg-border-strong')}
              testID={isDraggable ? 'bottom-sheet-handle' : undefined}
            />
          </View>
          {/* Controls centre on the title's first line, so a wrapped title grows downward. */}
          {hasHeader ? (
            <View className="min-h-14 flex-row items-start px-5 py-1.5">
              {backAction ? (
                <View className={hasBalancedHeader ? 'min-w-11 flex-1 items-start' : undefined}>
                  <Pressable
                    accessibilityLabel={backAction.accessibilityLabel}
                    accessibilityRole="button"
                    className={cn(
                      'size-11 items-center justify-center rounded-full active:bg-secondary',
                      !hasBalancedHeader && '-ml-2 mr-2',
                    )}
                    hitSlop={4}
                    onPress={backAction.onPress}
                  >
                    <ArrowLeftIcon className="size-6 text-foreground" />
                  </Pressable>
                </View>
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
                  'min-w-0 font-semibold text-foreground',
                  // Both variants fill the 44-point first line that the header controls centre on.
                  titleVariant === 'prompt' ? 'py-2.5 text-base' : 'py-2 text-lg',
                  hasBalancedHeader ? 'shrink px-2' : 'flex-1',
                  resolvedTitleAlign === 'center' && 'text-center',
                )}
                numberOfLines={titleVariant === 'prompt' ? undefined : 2}
              >
                {title}
              </Text>
              {hasBalancedHeader ? (
                <View className="min-h-11 min-w-11 flex-1 items-end justify-center">
                  {headerAction}
                </View>
              ) : headerAction ? (
                <View className="ml-2 min-h-11 justify-center">{headerAction}</View>
              ) : null}
            </View>
          ) : null}
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
        </Animated.View>
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
      ? [{ height, size: undefined }]
      : (sizes ?? (size ? [size] : [])).map((sheetSize) => ({
          height: Math.round(availableCardHeight * HEIGHT_RATIOS[sheetSize]),
          size: sheetSize,
        }));
  const cardHeights = requestedCardHeights
    .map((item) => ({ ...item, height: Math.max(0, Math.min(item.height, availableCardHeight)) }))
    .sort((left, right) => left.height - right.height)
    .filter((item, index, heights) => index === 0 || item.height !== heights[index - 1]?.height);
  const cardHeight = cardHeights.at(-1)?.height ?? 0;
  const closedDetent = dismissible ? 0 : programmatic(0);
  const detents: Detent[] = [closedDetent, ...cardHeights.map((item) => item.height)];
  const openIndex = Math.max(OPEN_INDEX, cardHeights.findIndex((item) => item.size === size) + 1);
  const sizeByIndex = [undefined, ...cardHeights.map((item) => item.size)];

  return {
    cardHeight,
    minCardHeight: cardHeights[0]?.height ?? 0,
    detents,
    openIndex,
    sizeByIndex,
  };
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
