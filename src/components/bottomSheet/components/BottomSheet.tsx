import { type Detent, ModalBottomSheet } from '@swmansion/react-native-bottom-sheet';
import { GlassView } from 'expo-glass-effect';
import { XIcon } from 'lucide-uniwind/png';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { bottomSheet, isLiquidGlassAvailable, sheetScrimColor } from '@/config/constants';

import {
  type BottomSheetCloseReason,
  BottomSheetContext,
  controlledCloseReason,
} from '../hooks/useBottomSheet';
import { useScreenCornerRadius } from '../hooks/useScreenCornerRadius';

const CLOSED_INDEX = 0;
const OPEN_INDEX = 1;

// Default snap points: closed, then a single content-sized open detent. The open
// index (1) is the first non-closed detent, so this stays correct when a caller
// passes extra detents above it (e.g. `[0, medium, 'content']` for a drag-to-expand
// sheet — the sheet opens at `medium` and can be dragged up to `content`).
const DEFAULT_DETENTS: Detent[] = [0, 'content'];

// The card's top corners touch no screen edge, so there is nothing for them to
// be concentric with — they are simply the resting radius. Deriving them from
// anything device-shaped is what made them wander before: off the safe-area
// inset they jumped 28 -> 48 when an Android user switched from gesture to
// three-button navigation, dragging the close button and header height with
// them; off `bottomCornerRadius` a 62pt display would do the same.
const TOP_CORNER_RADIUS = bottomSheet.cornerRadius;

// Nudge the round close button into the card's rounded top corner so the two
// curves sit concentric.
const HEADER_INSET = Math.max(0, TOP_CORNER_RADIUS - bottomSheet.headerSideWidth / 2);

type BottomSheetProps = {
  children: ReactNode;
  // Accessibility label for the built-in circular close button.
  closeAccessibilityLabel?: string;
  // Snap points (ascending by height), defaulting to `[0, 'content']`. Pass extra
  // detents to make the sheet drag-resizable, e.g. `[0, mediumHeight, 'content']`
  // opens at `mediumHeight` and can be dragged up to the full content height. When
  // using numeric detents below `'content'`, also set a fixed `height` so the card
  // stays a known size and shorter detents crop it predictably.
  detents?: Detent[];
  // Optional right-header slot; defaults to a balancing spacer so the title
  // stays centered opposite the close button.
  headerRight?: ReactNode;
  // Fixed inner-card height. Omit to size the card to its content.
  height?: number;
  // Disables the close button and blocks gesture / scrim dismissal — e.g. while
  // a blocking task (a connectivity check) owns the sheet.
  isCloseDisabled?: boolean;
  // Controlled open state. Defaults to `true` so a sheet that is conditionally
  // mounted simply opens on mount.
  isOpen?: boolean;
  // Fires once, after the closing animation settles, with the close reason.
  onClose: (reason: BottomSheetCloseReason) => void;
  // Prefix for the derived part testIDs: `${testID}-sheet`, `-sheet-surface`,
  // `-sheet-bottom-gap`, `-header`, `-close`, `-close-glass`.
  testID?: string;
  // Centered header title. A string is rendered with the standard title style;
  // pass a node when the title needs its own testID or markup.
  title?: ReactNode;
};

export function BottomSheet({
  children,
  closeAccessibilityLabel,
  detents = DEFAULT_DETENTS,
  headerRight,
  height,
  isCloseDisabled = false,
  isOpen = true,
  onClose,
  testID,
  title,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const screenCornerRadius = useScreenCornerRadius();
  const [index, setIndex] = useState(isOpen ? OPEN_INDEX : CLOSED_INDEX);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const reasonRef = useRef<BottomSheetCloseReason>('dismiss');
  const closedNotifiedRef = useRef(false);

  // Mirror the controlled `isOpen` into the detent index during render (the
  // pattern each sheet hand-rolled before this shared frame existed).
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    setIndex(isOpen ? OPEN_INDEX : CLOSED_INDEX);
  }

  // Rearm the one-shot close notification and reset the reason whenever the
  // sheet (re)opens. This lives in an effect because refs must not be written
  // during render; a close can't settle before the reopen commits, so the
  // rearm still lands before any subsequent close notification.
  useEffect(() => {
    if (isOpen) {
      closedNotifiedRef.current = false;
      reasonRef.current = 'dismiss';
      return;
    }

    // Closed from the outside, before the animation settles: the owner hears
    // back that this was its own doing and not the user's.
    reasonRef.current = controlledCloseReason;
  }, [isOpen]);

  const sheetWidth = Math.max(0, windowWidth - bottomSheet.outerInset * 2);
  // The card is inset by `outerInset` from the left, right and bottom screen
  // edges alike (left/right via `sheetWidth`, bottom via the gap rendered below
  // the card — the sheet host itself sits flush with the screen bottom). That
  // uniform inset is what makes the corners concentric: subtracting it from the
  // display's own radius puts both curves on the same center, so the card's
  // bottom corners stay parallel to the screen's.
  //
  // A display that can't name a radius reports 0, and the clamp resolves that
  // to the resting radius. There is deliberately no approximation in between:
  // on a square screen — or one whose radius we simply don't know — no value is
  // more concentric than another, so guessing one only fakes the alignment.
  const bottomCornerRadius = Math.max(
    bottomSheet.cornerRadius,
    screenCornerRadius - bottomSheet.outerInset,
  );
  const cornerStyle = {
    borderBottomLeftRadius: bottomCornerRadius,
    borderBottomRightRadius: bottomCornerRadius,
    borderTopLeftRadius: TOP_CORNER_RADIUS,
    borderTopRightRadius: TOP_CORNER_RADIUS,
  };

  const requestClose = useCallback(
    (reason: BottomSheetCloseReason = 'dismiss') => {
      if (isCloseDisabled) {
        return;
      }
      reasonRef.current = reason;
      setIndex(CLOSED_INDEX);
    },
    [isCloseDisabled],
  );

  const handleIndexChange = useCallback(
    (nextIndex: number) => {
      // Snap back open on a gesture / scrim collapse while a blocking task owns
      // the sheet, mirroring `Dialog`'s `isCloseOnPress={!isChecking}`.
      if (nextIndex === CLOSED_INDEX && isCloseDisabled) {
        setIndex(OPEN_INDEX);
        return;
      }
      setIndex(nextIndex);
    },
    [isCloseDisabled],
  );

  const handleSettle = useCallback(
    (nextIndex: number) => {
      if (nextIndex !== CLOSED_INDEX || closedNotifiedRef.current) {
        return;
      }
      closedNotifiedRef.current = true;
      onClose(reasonRef.current);
    },
    [onClose],
  );

  const isClosing = index === CLOSED_INDEX;
  const isCloseButtonDisabled = isCloseDisabled || isClosing;

  const contextValue = useMemo(
    () => ({
      geometry: {
        bottomCornerRadius,
        insets,
        sheetWidth,
        topCornerRadius: TOP_CORNER_RADIUS,
      },
      isClosing,
      requestClose,
    }),
    [bottomCornerRadius, insets, isClosing, requestClose, sheetWidth],
  );

  const closeButton = (
    <BottomSheetCloseButton
      disabled={isCloseButtonDisabled}
      label={closeAccessibilityLabel}
      onPress={requestClose}
      testID={testID ? `${testID}-close` : undefined}
    />
  );

  return (
    // The provider must live *inside* ModalBottomSheet: the sheet hosts its
    // children in a separate native overlay root, so a provider wrapped around
    // ModalBottomSheet would not reach the body — `useBottomSheet()` would throw.
    <ModalBottomSheet
      detents={detents}
      index={index}
      onIndexChange={handleIndexChange}
      onSettle={handleSettle}
      scrimColor={sheetScrimColor}
    >
      <BottomSheetContext.Provider value={contextValue}>
        <View style={[styles.layout, { width: windowWidth }]}>
          <View
            style={[
              styles.sheet,
              cornerStyle,
              height === undefined ? { width: sheetWidth } : { height, width: sheetWidth },
            ]}
            testID={testID ? `${testID}-sheet` : undefined}
          >
            {isLiquidGlassAvailable ? (
              <GlassView
                glassEffectStyle="regular"
                style={[styles.surface, cornerStyle]}
                testID={testID ? `${testID}-sheet-surface` : undefined}
              />
            ) : (
              <View
                className="bg-background"
                style={[styles.surface, cornerStyle]}
                testID={testID ? `${testID}-sheet-surface` : undefined}
              />
            )}

            <View
              className="flex-row"
              style={styles.header}
              testID={testID ? `${testID}-header` : undefined}
            >
              {isLiquidGlassAvailable ? (
                <GlassView
                  glassEffectStyle="regular"
                  isInteractive={!isCloseButtonDisabled}
                  style={styles.closeSurface}
                  testID={testID ? `${testID}-close-glass` : undefined}
                >
                  {closeButton}
                </GlassView>
              ) : (
                <View className="bg-surface-secondary" style={styles.closeSurface}>
                  {closeButton}
                </View>
              )}

              {typeof title === 'string' ? (
                <Text
                  className="flex-1 px-3 text-center font-semibold text-foreground text-base"
                  numberOfLines={1}
                >
                  {title}
                </Text>
              ) : (
                title
              )}

              {headerRight ?? <View style={styles.headerSide} />}
            </View>

            {children}
          </View>
          <View
            style={styles.bottomGap}
            testID={testID ? `${testID}-sheet-bottom-gap` : undefined}
          />
        </View>
      </BottomSheetContext.Provider>
    </ModalBottomSheet>
  );
}

function BottomSheetCloseButton({
  disabled,
  label,
  onPress,
  testID,
}: {
  disabled: boolean;
  label?: string;
  onPress: (reason?: BottomSheetCloseReason) => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className="h-full w-full items-center justify-center rounded-full active:opacity-60 disabled:opacity-40"
      disabled={disabled}
      hitSlop={8}
      onPress={() => onPress('dismiss')}
      testID={testID}
    >
      <XIcon className="size-5 text-foreground" strokeWidth={2.25} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bottomGap: { height: bottomSheet.outerInset },
  closeSurface: {
    alignSelf: 'flex-start',
    borderCurve: 'continuous',
    borderRadius: bottomSheet.headerSideWidth / 2,
    height: bottomSheet.headerSideWidth,
    overflow: 'hidden',
    width: bottomSheet.headerSideWidth,
  },
  header: {
    alignItems: 'center',
    height: Math.max(bottomSheet.headerHeight, HEADER_INSET + bottomSheet.headerSideWidth),
    paddingHorizontal: HEADER_INSET,
    paddingTop: HEADER_INSET,
  },
  headerSide: { height: bottomSheet.headerSideWidth, width: bottomSheet.headerSideWidth },
  // Pin the wrapper to the true window width so `alignItems: 'center'` centers
  // against the window, not the native overlay host — on a real iPhone (iOS 27)
  // that host can be ~16pt narrower and left-aligned, which would otherwise
  // shift the floating card left.
  layout: { alignItems: 'center' },
  sheet: {
    borderCurve: 'continuous',
    borderRadius: bottomSheet.cornerRadius,
    overflow: 'hidden',
  },
  surface: {
    borderCurve: 'continuous',
    borderRadius: bottomSheet.cornerRadius,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
