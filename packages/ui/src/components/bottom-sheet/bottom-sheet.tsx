import ArrowLeftIcon from '@cherrystudio/app-icons/icons/arrow-left';
import {
  BottomSheetProvider as NativeBottomSheetProvider,
  type Detent,
  ModalBottomSheet,
  programmatic,
} from '@swmansion/react-native-bottom-sheet';
import { getCornerRadiusSync } from 'expo-screen-corner-radius';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';

const CLOSED_INDEX = 0;
const OPEN_INDEX = 1;
const OUTER_INSET = 4;
const TOP_INSET = 12;
const BOTTOM_CORNER_RADIUS = 28;
const TOP_CORNER_RADIUS = 32;
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
  backAction?: BottomSheetBackAction;
  children: ReactNode;
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
    backAction,
    children,
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
  const screenCornerRadius = getCornerRadiusSync() ?? 0;
  const scrimStyle = useResolveClassNames('bg-scrim');
  const scrimColor =
    typeof scrimStyle.backgroundColor === 'string' ? scrimStyle.backgroundColor : undefined;
  const availableCardHeight = Math.max(0, windowHeight - insets.top - TOP_INSET - OUTER_INSET);
  const { height, size, sizes } = props;
  const { cardHeight, detents } = useMemo(
    () => resolveSheetHeights(availableCardHeight, dismissible, height, size, sizes),
    [availableCardHeight, dismissible, height, size, sizes],
  );
  const cardWidth = Math.max(0, windowWidth - OUTER_INSET * 2);
  const detentHeight = cardHeight + OUTER_INSET;
  const bottomCornerRadius = Math.max(BOTTOM_CORNER_RADIUS, screenCornerRadius - OUTER_INSET);
  const hasFooter = footer != null;
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
      detents={detents}
      index={index}
      onIndexChange={handleIndexChange}
      onSettle={handleSettle}
      scrimColor={scrimColor}
    >
      <View style={[styles.layout, { height: detentHeight, width: '100%' }]}>
        <View
          accessibilityElementsHidden={!open}
          accessibilityViewIsModal
          className="overflow-hidden border-continuous bg-background"
          importantForAccessibility={open ? 'yes' : 'no-hide-descendants'}
          onAccessibilityEscape={dismissible ? requestClose : undefined}
          style={[
            styles.card,
            {
              borderBottomLeftRadius: bottomCornerRadius,
              borderBottomRightRadius: bottomCornerRadius,
              height: cardHeight,
              width: cardWidth,
            },
          ]}
          testID={testID}
        >
          <View accessibilityElementsHidden className="items-center pt-3" pointerEvents="none">
            <View className="h-1 w-9 rounded-full bg-border-strong" />
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
            ) : null}
            <Text
              accessibilityRole="header"
              className="min-w-0 flex-1 font-semibold text-foreground text-lg"
              numberOfLines={2}
            >
              {title}
            </Text>
            {headerAction ? <View className="ml-2">{headerAction}</View> : null}
          </View>
          <View
            className="min-h-0 flex-1"
            style={hasFooter ? undefined : { paddingBottom: insets.bottom }}
          >
            {children}
          </View>
          {hasFooter ? (
            <View
              className="border-t border-border bg-background px-4 pt-3"
              style={{ paddingBottom: Math.max(insets.bottom, 16) }}
            >
              {footer}
            </View>
          ) : null}
        </View>
        <View style={styles.bottomGap} />
      </View>
    </ModalBottomSheet>
  );
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
  const detents: Detent[] = [closedDetent, ...cardHeights.map((height) => height + OUTER_INSET)];

  return { cardHeight, detents };
}

const styles = StyleSheet.create({
  bottomGap: {
    height: OUTER_INSET,
  },
  card: {
    borderCurve: 'continuous',
    borderTopLeftRadius: TOP_CORNER_RADIUS,
    borderTopRightRadius: TOP_CORNER_RADIUS,
  },
  layout: {
    alignItems: 'center',
  },
});
