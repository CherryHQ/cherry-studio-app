import { type Detent, ModalBottomSheet } from '@swmansion/react-native-bottom-sheet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';

import { SearchField } from '../search-field';
import { Surface } from '../surface';
import {
  BottomSheetContext,
  BottomSheetRootContext,
  controlledCloseReason,
  useBottomSheetRoot,
} from './bottom-sheet.context';
import { bottomSheetLayout } from './bottom-sheet.layout';
import type {
  BottomSheetBodyProps,
  BottomSheetCloseReason,
  BottomSheetContentProps,
  BottomSheetFooterProps,
  BottomSheetRootProps,
  BottomSheetScrollViewProps,
  BottomSheetSearchFieldProps,
  BottomSheetTriggerProps,
} from './bottom-sheet.types';
import { useScreenCornerRadius } from './use-screen-corner-radius';

const CLOSED_INDEX = 0;
const OPEN_INDEX = 1;
const DEFAULT_DETENTS: Detent[] = [0, 'content'];
const TOP_CORNER_RADIUS = bottomSheetLayout.cornerRadius;

export function BottomSheetRoot({
  children,
  defaultOpen = false,
  onOpenChange,
  open: controlledOpen,
}: BottomSheetRootProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange],
  );
  const contextValue = useMemo(() => ({ open, setOpen }), [open, setOpen]);

  return (
    <BottomSheetRootContext.Provider value={contextValue}>
      {children}
    </BottomSheetRootContext.Provider>
  );
}

BottomSheetRoot.displayName = 'BottomSheet';

export function BottomSheetTrigger({ children, onPress, ...props }: BottomSheetTriggerProps) {
  const { setOpen } = useBottomSheetRoot();

  return (
    <Pressable
      {...props}
      onPress={(event) => {
        onPress?.(event);
        setOpen(true);
      }}
    >
      {children}
    </Pressable>
  );
}

export function BottomSheetContent({
  children,
  detents = DEFAULT_DETENTS,
  height,
  isCloseDisabled = false,
  onClose,
  testID,
}: BottomSheetContentProps) {
  const { open, setOpen } = useBottomSheetRoot();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const screenCornerRadius = useScreenCornerRadius();
  const scrimStyle = useResolveClassNames('bg-scrim');
  const scrimColor =
    typeof scrimStyle.backgroundColor === 'string' ? scrimStyle.backgroundColor : undefined;
  const [index, setIndex] = useState(open ? OPEN_INDEX : CLOSED_INDEX);
  const [previousOpen, setPreviousOpen] = useState(open);
  const reasonRef = useRef<BottomSheetCloseReason>('dismiss');
  const closedNotifiedRef = useRef(false);

  if (open !== previousOpen) {
    setPreviousOpen(open);
    setIndex(open ? OPEN_INDEX : CLOSED_INDEX);
  }

  useEffect(() => {
    if (open) {
      closedNotifiedRef.current = false;
      reasonRef.current = 'dismiss';
      return;
    }

    reasonRef.current = controlledCloseReason;
  }, [open]);

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
        setOpen(false);
        onClose?.(reasonRef.current);
      }
    },
    [onClose, setOpen],
  );

  const isClosing = index === CLOSED_INDEX;
  const contextValue = useMemo(
    () => ({
      geometry: {
        bottomCornerRadius,
        insets,
        outerInset: bottomSheetLayout.outerInset,
        sheetWidth,
        topCornerRadius: TOP_CORNER_RADIUS,
      },
      isCloseDisabled: isCloseDisabled || isClosing,
      isClosing,
      requestClose,
      testID,
    }),
    [bottomCornerRadius, insets, isCloseDisabled, isClosing, requestClose, sheetWidth, testID],
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

export function BottomSheetSearchField(props: BottomSheetSearchFieldProps) {
  return (
    <View className="px-4 pt-2">
      <SearchField {...props} />
    </View>
  );
}

export function BottomSheetBody({ children, style, ...props }: BottomSheetBodyProps) {
  return (
    <View {...props} style={[styles.body, style]}>
      {children}
    </View>
  );
}

export function BottomSheetScrollView({ children, style, ...props }: BottomSheetScrollViewProps) {
  return (
    <ScrollView {...props} style={[styles.body, style]}>
      {children}
    </ScrollView>
  );
}

export function BottomSheetFooter({ children, style, ...props }: BottomSheetFooterProps) {
  return (
    <View {...props} style={[styles.footer, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, minHeight: 0 },
  bottomGap: { height: bottomSheetLayout.outerInset },
  footer: { flexShrink: 0 },
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
