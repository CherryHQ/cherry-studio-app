import { type Detent, ModalBottomSheet } from '@swmansion/react-native-bottom-sheet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';

import { Surface } from '../surface';
import { BottomSheetHeader } from './bottom-sheet-header';
import { BottomSheetPageTransition } from './bottom-sheet-page-transition';
import { BottomSheetContext, controlledCloseReason } from './bottom-sheet.context';
import { bottomSheetLayout } from './bottom-sheet.layout';
import type { BottomSheetCloseReason, BottomSheetProps } from './bottom-sheet.types';
import { useScreenCornerRadius } from './use-screen-corner-radius';

const CLOSED_INDEX = 0;
const OPEN_INDEX = 1;
const DEFAULT_DETENTS: Detent[] = [0, 'content'];
const TOP_CORNER_RADIUS = bottomSheetLayout.cornerRadius;

function BottomSheetRoot({
  backAccessibilityLabel,
  children,
  closeAccessibilityLabel,
  detents = DEFAULT_DETENTS,
  headerRight,
  height,
  isCloseDisabled = false,
  isOpen = true,
  onBack,
  onClose,
  testID,
  title,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const screenCornerRadius = useScreenCornerRadius();
  const scrimStyle = useResolveClassNames('bg-scrim');
  const scrimColor =
    typeof scrimStyle.backgroundColor === 'string' ? scrimStyle.backgroundColor : undefined;
  const [index, setIndex] = useState(isOpen ? OPEN_INDEX : CLOSED_INDEX);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const reasonRef = useRef<BottomSheetCloseReason>('dismiss');
  const closedNotifiedRef = useRef(false);

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    setIndex(isOpen ? OPEN_INDEX : CLOSED_INDEX);
  }

  useEffect(() => {
    if (isOpen) {
      closedNotifiedRef.current = false;
      reasonRef.current = 'dismiss';
      return;
    }

    reasonRef.current = controlledCloseReason;
  }, [isOpen]);

  const sheetWidth = Math.max(0, windowWidth - bottomSheetLayout.outerInset * 2);
  const bottomCornerRadius = Math.max(
    bottomSheetLayout.cornerRadius,
    screenCornerRadius - bottomSheetLayout.outerInset,
  );
  const cornerStyle = {
    borderBottomLeftRadius: bottomCornerRadius,
    borderBottomRightRadius: bottomCornerRadius,
    borderTopLeftRadius: TOP_CORNER_RADIUS,
    borderTopRightRadius: TOP_CORNER_RADIUS,
  };

  const requestClose = useCallback(
    (reason: BottomSheetCloseReason = 'dismiss') => {
      if (!isCloseDisabled) {
        reasonRef.current = reason;
        setIndex(CLOSED_INDEX);
      }
    },
    [isCloseDisabled],
  );

  const handleIndexChange = useCallback(
    (nextIndex: number) => {
      setIndex(nextIndex === CLOSED_INDEX && isCloseDisabled ? OPEN_INDEX : nextIndex);
    },
    [isCloseDisabled],
  );

  const handleSettle = useCallback(
    (nextIndex: number) => {
      if (nextIndex === CLOSED_INDEX && !closedNotifiedRef.current) {
        closedNotifiedRef.current = true;
        onClose(reasonRef.current);
      }
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
        outerInset: bottomSheetLayout.outerInset,
        sheetWidth,
        topCornerRadius: TOP_CORNER_RADIUS,
      },
      isClosing,
      requestClose,
    }),
    [bottomCornerRadius, insets, isClosing, requestClose, sheetWidth],
  );

  return (
    <ModalBottomSheet
      detents={detents}
      index={index}
      onIndexChange={handleIndexChange}
      onSettle={handleSettle}
      scrimColor={scrimColor}
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
            <Surface
              className="bg-background"
              cornerRadius={TOP_CORNER_RADIUS}
              style={[styles.surface, cornerStyle]}
              testID={testID ? `${testID}-sheet-surface` : undefined}
            />

            <BottomSheetHeader
              backAccessibilityLabel={backAccessibilityLabel}
              closeAccessibilityLabel={closeAccessibilityLabel}
              headerRight={headerRight}
              isDisabled={isCloseButtonDisabled}
              onBack={onBack}
              onRequestClose={requestClose}
              testID={testID}
              title={title}
            />

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

BottomSheetRoot.displayName = 'BottomSheet';

export const BottomSheet = Object.assign(BottomSheetRoot, {
  PageTransition: BottomSheetPageTransition,
});

const styles = StyleSheet.create({
  bottomGap: { height: bottomSheetLayout.outerInset },
  layout: { alignItems: 'center' },
  sheet: {
    borderCurve: 'continuous',
    borderRadius: bottomSheetLayout.cornerRadius,
    overflow: 'hidden',
  },
  surface: {
    borderCurve: 'continuous',
    borderRadius: bottomSheetLayout.cornerRadius,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
