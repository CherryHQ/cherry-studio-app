import ArrowLeftIcon from '@cherrystudio/app-icons/icons/arrow-left';
import XIcon from '@cherrystudio/app-icons/icons/x';
import {
  BottomSheetProvider as NativeBottomSheetProvider,
  type Detent,
  ModalBottomSheet,
  type PositionChangeEventData,
  programmatic,
} from '@swmansion/react-native-bottom-sheet';
import {
  createContext,
  type ReactNode,
  type RefObject,
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BackHandler,
  Keyboard,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewInstance,
  type ViewStyle,
} from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, {
  createAnimatedComponent,
  type SharedValue,
  useAnimatedStyle,
  useEvent,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';

import { cn } from '../../utils';
import { focusMenuTarget } from '../menu/menu-focus';
import { useNavigationOverlay } from '../portal/overlay-navigation';

const CLOSED_INDEX = 0;
const OPEN_INDEX = 1;
const TOP_INSET = 12;
const MAX_CARD_WIDTH = 720;
const TOP_CORNER_RADIUS = 32;
const KEYBOARD_GAP = 12;
const OVERLAY_HANDLE_HEIGHT = 32;
const RESIZABLE_HANDLE_HEIGHT = 44;
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

const SheetPresentationContext = createContext<{
  height: number;
  registerChild: () => () => void;
  returnFocusRef: RefObject<ViewInstance | null>;
} | null>(null);

const BottomSheetBoundsContext = createContext<{ insetLeft: number; insetRight: number }>({
  insetLeft: 0,
  insetRight: 0,
});

/**
 * Constrains bottom sheets to the active content pane on wide multi-column layouts so sheets
 * center inside the open pane instead of straddling a permanent navigation rail or sidebar.
 */
export function BottomSheetBoundsProvider({
  children,
  insetLeft = 0,
  insetRight = 0,
}: {
  children: ReactNode;
  insetLeft?: number;
  insetRight?: number;
}) {
  const value = useMemo(() => ({ insetLeft, insetRight }), [insetLeft, insetRight]);
  return <BottomSheetBoundsContext value={value}>{children}</BottomSheetBoundsContext>;
}

type BottomSheetBaseProps = {
  /** A sibling overlay may cover this sheet while its content and scroll state stay mounted. */
  active?: boolean;
  /** Keep content above the keyboard; resizable sheets retain their selected height. */
  avoidKeyboard?: boolean;
  backAction?: BottomSheetBackAction;
  /**
   * Controls whether the body wrapper adds bottom safe-area padding when no footer is rendered.
   * Pass `'none'` when a scrollable child applies bottom safe-area padding to its own scroll content.
   */
  bodyInset?: 'safe-area' | 'none';
  children: ReactNode;
  closeAction?: { accessibilityLabel: string };
  dismissible?: boolean;
  footer?: ReactNode;
  headerAction?: ReactNode;
  /** Handles system Back/Escape without adding a visible header button. */
  onBack?: () => void;
  onClose: () => void;
  /** Runs after a controlled or interactive dismissal finishes. */
  onClosed?: () => void;
  open: boolean;
  /** Overlay flows have only a handle; nested sheets cover their parent at the same height. */
  presentation?: 'default' | 'overlay';
  initialFocusRef?: RefObject<ViewInstance | null>;
  returnFocusRef?: RefObject<ViewInstance | null>;
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
        size: BottomSheetSize | 'content';
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
    active = true,
    avoidKeyboard = false,
    backAction,
    bodyInset = 'safe-area',
    children,
    closeAction,
    dismissible = true,
    footer,
    headerAction,
    onBack,
    onClose,
    onClosed,
    open,
    initialFocusRef,
    returnFocusRef,
    testID,
    title,
    titleAlign,
    titleVariant = 'heading',
  } = props;
  const parent = use(SheetPresentationContext);
  const presentation = props.presentation ?? (parent ? 'overlay' : 'default');
  const isOverlay = presentation === 'overlay';
  const headingRef = useRef<ViewInstance>(null);
  const [childCount, setChildCount] = useState(0);
  const registerChild = useCallback(() => {
    setChildCount((count) => count + 1);
    return () => setChildCount((count) => count - 1);
  }, []);
  const [isPresented, setIsPresented] = useState(open);
  const [hasOpened, setHasOpened] = useState(open);
  const [contentHeight, setContentHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const insets = useSafeAreaInsets();
  const bounds = use(BottomSheetBoundsContext);
  const effectiveLeft = Math.max(insets.left, bounds.insetLeft);
  const effectiveRight = Math.max(insets.right, bounds.insetRight);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const isConstrainedPane = bounds.insetLeft > insets.left || bounds.insetRight > insets.right;
  const isWideWindow = windowWidth >= 800 || isConstrainedPane;
  const paneWidth = Math.max(0, windowWidth - effectiveLeft - effectiveRight);
  const cardWidth = Math.max(0, Math.min(MAX_CARD_WIDTH, paneWidth));
  const scrimStyle = useResolveClassNames('bg-scrim');
  const scrimColor =
    typeof scrimStyle.backgroundColor === 'string' ? scrimStyle.backgroundColor : undefined;
  const availableCardHeight = Math.max(0, windowHeight - insets.top - TOP_INSET);
  const { height, onSizeChange, size, sizes } = props;
  const hasHeader = title != null || Boolean(backAction || closeAction || headerAction);
  const measuredHeight =
    size === 'content'
      ? contentHeight +
        (isOverlay ? OVERLAY_HANDLE_HEIGHT : hasHeader ? headerHeight + 16 : 22) +
        (footer ? footerHeight : insets.bottom)
      : height;
  const { cardHeight, minimumCardHeight, detents, heightByIndex, openIndex, sizeByIndex } = useMemo(
    () =>
      resolveSheetHeights(
        availableCardHeight,
        dismissible,
        measuredHeight,
        size === 'content' ? undefined : size,
        sizes,
        isOverlay ? parent?.height : undefined,
        isWideWindow,
      ),
    [
      availableCardHeight,
      dismissible,
      measuredHeight,
      size,
      sizes,
      isOverlay,
      parent?.height,
      isWideWindow,
    ],
  );
  const isResizable = detents.length > 2;
  // Resizable sheets keep their snap points; keyboard space only shrinks the body.
  const followsKeyboardContentHeight = avoidKeyboard && !isResizable;
  const childPresentation = useMemo(
    () => (isOverlay ? { height: cardHeight, registerChild, returnFocusRef: headingRef } : null),
    [cardHeight, isOverlay, registerChild],
  );
  const hasFooter = footer != null;
  // A handle promises a drag; a sheet that can neither close nor resize offers none.
  const isDraggable = dismissible || isResizable;
  const bottomInset = hasFooter ? Math.max(insets.bottom, 16) : insets.bottom;
  const spacerBottomInset = hasFooter
    ? Math.max(insets.bottom, 16)
    : bodyInset === 'none'
      ? KEYBOARD_GAP
      : insets.bottom;
  const isCloseActionVisible = Boolean(closeAction && !backAction);
  const resolvedTitleAlign = titleAlign ?? (isCloseActionVisible ? 'center' : 'start');
  const hasBalancedHeader =
    isCloseActionVisible || Boolean(backAction && resolvedTitleAlign === 'center');
  const [index, setIndex] = useState(open ? openIndex : CLOSED_INDEX);
  const [layoutIndex, setLayoutIndex] = useState(openIndex);
  const [previousOpen, setPreviousOpen] = useState(open);
  const [previousOpenIndex, setPreviousOpenIndex] = useState(openIndex);
  const hasNotifiedCloseRef = useRef(false);

  if (open !== previousOpen) {
    setPreviousOpen(open);
    setPreviousOpenIndex(openIndex);
    setIndex(open ? openIndex : CLOSED_INDEX);
    if (open) {
      setLayoutIndex(openIndex);
      setIsPresented(true);
      setHasOpened(true);
    }
  } else if (openIndex !== previousOpenIndex) {
    setPreviousOpenIndex(openIndex);
    if (open && index !== CLOSED_INDEX) {
      setIndex(openIndex);
      if (openIndex > layoutIndex) {
        setLayoutIndex(openIndex);
      }
    }
  }

  const effectiveLayoutIndex = Math.min(
    layoutIndex,
    Math.max(OPEN_INDEX, heightByIndex.length - 1),
  );
  const layoutHeight = heightByIndex[effectiveLayoutIndex] ?? cardHeight;
  const position = useSharedValue(open ? layoutHeight : 0);
  const handlePositionChange = useEvent<NativeSyntheticEvent<PositionChangeEventData>>(
    (event) => {
      'worklet';
      position.set(event.position);
    },
    ['onPositionChange'],
  );

  const registerWithParent = parent?.registerChild;
  useEffect(() => {
    if (isPresented) return registerWithParent?.();
  }, [isPresented, registerWithParent]);

  useEffect(() => {
    if (open) {
      hasNotifiedCloseRef.current = false;
    }
  }, [open]);

  const dismiss = useCallback(() => {
    if (!dismissible) {
      return;
    }

    Keyboard.dismiss();
    setIndex(CLOSED_INDEX);
  }, [dismissible]);
  const requestClose = useCallback(() => {
    if (active && childCount === 0) dismiss();
  }, [active, childCount, dismiss]);

  useNavigationOverlay(open, dismissible ? dismiss : undefined);

  const handleHardwareBackPress = useEffectEvent(() => {
    if (!active || childCount > 0) return false;
    if (onBack) {
      onBack();
    } else if (backAction) {
      backAction.onPress();
    } else {
      requestClose();
    }

    return true;
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () =>
      handleHardwareBackPress(),
    );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && handleHardwareBackPress()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    if (Platform.OS === 'web') document.addEventListener('keydown', onKeyDown);

    return () => {
      subscription.remove();
      if (Platform.OS === 'web') document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleIndexChange = useCallback(
    (nextIndex: number) => {
      setIndex(nextIndex);
      if (avoidKeyboard && nextIndex < index) {
        Keyboard.dismiss();
      }
      if (nextIndex > CLOSED_INDEX) {
        if (nextIndex > layoutIndex) {
          setLayoutIndex(nextIndex);
        }
        const nextSize = sizeByIndex[nextIndex];
        if (nextSize) {
          onSizeChange?.(nextSize);
        }
      }
    },
    [avoidKeyboard, index, layoutIndex, onSizeChange, sizeByIndex],
  );
  const handleSettle = useCallback(
    (nextIndex: number) => {
      if (nextIndex !== CLOSED_INDEX) {
        if (nextIndex === index && nextIndex !== layoutIndex) {
          setLayoutIndex(nextIndex);
        }
        if (isOverlay && active && childCount === 0)
          focusMenuTarget(initialFocusRef?.current ?? headingRef.current);
        return;
      }
      if (hasNotifiedCloseRef.current || !isPresented) {
        return;
      }

      hasNotifiedCloseRef.current = true;
      setIsPresented(false);
      if (open && dismissible) {
        Keyboard.dismiss();
        onClose();
      }
      if (isOverlay) {
        requestAnimationFrame(() => {
          focusMenuTarget(returnFocusRef?.current ?? parent?.returnFocusRef.current ?? null);
          onClosed?.();
        });
      } else {
        onClosed?.();
      }
    },
    [
      active,
      childCount,
      dismissible,
      index,
      initialFocusRef,
      isOverlay,
      isPresented,
      layoutIndex,
      onClose,
      onClosed,
      open,
      parent?.returnFocusRef,
      returnFocusRef,
    ],
  );

  // Allocate a child portal after its parent first opens, then retain its scroll state on blur.
  if (isOverlay && !hasOpened) return null;

  const hasResizableHandleZone = isResizable && (isOverlay || !hasHeader);

  const handleAndBody = (
    <>
      <View
        accessibilityElementsHidden={!isOverlay}
        accessibilityLabel={isOverlay ? title : undefined}
        accessibilityRole={isOverlay ? 'header' : undefined}
        accessible={isOverlay}
        className={
          hasResizableHandleZone
            ? 'h-11 items-center justify-center'
            : cn('items-center pt-3', isOverlay ? 'h-8' : !hasHeader && 'pb-1.5')
        }
        pointerEvents="none"
        ref={headingRef}
        style={hasResizableHandleZone ? { height: RESIZABLE_HANDLE_HEIGHT } : undefined}
      >
        <View
          className={cn('h-1 w-9 rounded-full', isDraggable && 'bg-border-strong')}
          testID={isDraggable ? 'bottom-sheet-handle' : undefined}
        />
      </View>
      {/* Controls centre on the title's first line, so a wrapped title grows downward. */}
      {!isOverlay && hasHeader ? (
        <View
          className="min-h-14 flex-row items-start px-5 py-1.5"
          onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        >
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
        style={
          isResizable && hasFooter
            ? { paddingBottom: footerHeight }
            : hasFooter || bodyInset === 'none'
              ? undefined
              : { paddingBottom: insets.bottom }
        }
      >
        <SheetPresentationContext value={childPresentation}>
          {size === 'content' ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={(_, nextHeight) => setContentHeight(nextHeight)}
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </SheetPresentationContext>
      </View>
      {hasFooter && !isResizable ? (
        <View
          className="border-t border-border px-4 pt-3"
          onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
          style={{ paddingBottom: bottomInset }}
        >
          {footer}
        </View>
      ) : null}
      {avoidKeyboard ? <KeyboardSpacer bottomInset={spacerBottomInset} /> : null}
    </>
  );

  return (
    <ModalBottomSheet
      // UIKit menus need the presenting controller retained by the provider's view hierarchy.
      nativeOverlay={false}
      // Single-height keyboard avoidance animates the content height itself.
      animateContentHeight={!followsKeyboardContentHeight}
      detents={followsKeyboardContentHeight ? [detents[CLOSED_INDEX], 'content'] : detents}
      disableScrollableNegotiation={isResizable}
      index={index}
      onIndexChange={handleIndexChange}
      onPositionChange={isResizable && hasFooter ? handlePositionChange : undefined}
      onSettle={handleSettle}
      scrimColor={scrimColor}
      wrapNativeView={createAnimatedComponent}
    >
      <SheetLayout
        availableCardHeight={availableCardHeight}
        avoidKeyboard={followsKeyboardContentHeight}
        bottomInset={spacerBottomInset}
        cardHeight={cardHeight}
        style={[
          styles.layout,
          { width: '100%', paddingLeft: effectiveLeft, paddingRight: effectiveRight },
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
          accessibilityElementsHidden={!open || !active || childCount > 0}
          accessibilityViewIsModal
          className="overflow-hidden border-continuous bg-background dark:border-x dark:border-t dark:border-border dark:bg-popover"
          importantForAccessibility={
            open && active && childCount === 0 ? 'yes' : 'no-hide-descendants'
          }
          onAccessibilityEscape={
            active && childCount === 0
              ? (onBack ?? (dismissible ? requestClose : undefined))
              : undefined
          }
          pointerEvents={!active || childCount > 0 ? 'none' : 'auto'}
          style={[
            styles.card,
            followsKeyboardContentHeight
              ? { flex: 1, width: cardWidth }
              : { height: cardHeight, width: cardWidth },
          ]}
          testID={testID}
        >
          <View className="absolute inset-0 dark:bg-secondary" pointerEvents="none" />
          {isResizable ? (
            <View style={{ height: layoutHeight }}>{handleAndBody}</View>
          ) : (
            handleAndBody
          )}
          {hasFooter && isResizable ? (
            <ResizableSheetFooter
              bottomInset={bottomInset}
              cardHeight={cardHeight}
              minimumCardHeight={minimumCardHeight}
              onLayout={setFooterHeight}
              position={position}
            >
              {footer}
            </ResizableSheetFooter>
          ) : null}
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

function ResizableSheetFooter({
  bottomInset,
  cardHeight,
  children,
  minimumCardHeight,
  onLayout,
  position,
}: {
  bottomInset: number;
  cardHeight: number;
  children: ReactNode;
  minimumCardHeight: number;
  onLayout: (height: number) => void;
  position: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: Math.min(cardHeight, Math.max(minimumCardHeight, position.get())) - cardHeight,
      },
    ],
  }));

  return (
    <Animated.View
      className="border-t border-border bg-background px-4 pt-3 dark:bg-popover"
      onLayout={(event) => onLayout(event.nativeEvent.layout.height)}
      style={[styles.resizableFooter, { paddingBottom: bottomInset }, animatedStyle]}
    >
      <View className="absolute inset-0 dark:bg-secondary" pointerEvents="none" />
      {children}
    </Animated.View>
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

const WIDE_SIZE_MAX_HEIGHTS: Partial<Record<BottomSheetSize, number>> = {
  compact: 460,
  medium: 560,
  large: 680,
};

function resolveSheetHeights(
  availableCardHeight: number,
  dismissible: boolean,
  height: number | undefined,
  size: BottomSheetSize | undefined,
  sizes: BottomSheetSizes | undefined,
  minimumHeight = 0,
  isWideWindow = false,
) {
  const requestedCardHeights =
    height !== undefined
      ? [{ height, size: undefined }]
      : (sizes ?? (size ? [size] : [])).map((sheetSize) => {
          const proportional = Math.round(availableCardHeight * HEIGHT_RATIOS[sheetSize]);
          const maxCap = isWideWindow ? WIDE_SIZE_MAX_HEIGHTS[sheetSize] : undefined;
          return {
            height: maxCap ? Math.min(maxCap, proportional) : proportional,
            size: sheetSize,
          };
        });
  const cardHeights = requestedCardHeights
    .map((item) => ({
      ...item,
      height: Math.min(availableCardHeight, Math.max(0, minimumHeight, item.height)),
    }))
    .sort((left, right) => left.height - right.height)
    .filter((item, index, heights) => index === 0 || item.height !== heights[index - 1]?.height);
  const cardHeight = cardHeights.at(-1)?.height ?? 0;
  const closedDetent = dismissible ? 0 : programmatic(0);
  const detents: Detent[] = [closedDetent, ...cardHeights.map((item) => item.height)];
  const openIndex = Math.max(OPEN_INDEX, cardHeights.findIndex((item) => item.size === size) + 1);
  const sizeByIndex = [undefined, ...cardHeights.map((item) => item.size)];
  const heightByIndex = [undefined, ...cardHeights.map((item) => item.height)];

  return {
    cardHeight,
    minimumCardHeight: cardHeights[0]?.height ?? 0,
    detents,
    heightByIndex,
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
  resizableFooter: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
});
