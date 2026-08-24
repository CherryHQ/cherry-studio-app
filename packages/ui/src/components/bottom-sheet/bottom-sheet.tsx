import ArrowLeftIcon from '@cherrystudio/app-icons/icons/arrow-left';
import {
  BottomSheetProvider as NativeBottomSheetProvider,
  type Detent,
  ModalBottomSheet,
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
const OUTER_INSET = 8;
const TOP_INSET = 12;
const CORNER_RADIUS = 32;
const HEIGHT_RATIOS = {
  compact: 0.4,
  large: 0.8,
  medium: 0.6,
} as const;

export type BottomSheetSize = keyof typeof HEIGHT_RATIOS;

export type BottomSheetBackAction = {
  accessibilityLabel: string;
  onPress: () => void;
};

type BottomSheetBaseProps = {
  backAction?: BottomSheetBackAction;
  children: ReactNode;
  dismissible?: boolean;
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
      }
    | {
        height?: never;
        size: BottomSheetSize;
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
  const { backAction, children, dismissible = true, onClose, open, testID, title } = props;
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const scrimStyle = useResolveClassNames('bg-scrim');
  const scrimColor =
    typeof scrimStyle.backgroundColor === 'string' ? scrimStyle.backgroundColor : undefined;
  const availableCardHeight = Math.max(0, windowHeight - insets.top - TOP_INSET - OUTER_INSET);
  const requestedCardHeight =
    props.height === undefined
      ? Math.round(availableCardHeight * HEIGHT_RATIOS[props.size])
      : props.height;
  const cardHeight = Math.max(0, Math.min(requestedCardHeight, availableCardHeight));
  const sheetHeight = cardHeight + OUTER_INSET;
  const cardWidth = Math.max(0, windowWidth - OUTER_INSET * 2);
  const screenCornerRadius = getCornerRadiusSync() ?? 0;
  const bottomCornerRadius = Math.max(CORNER_RADIUS, screenCornerRadius - OUTER_INSET);
  const cornerStyle = {
    borderBottomLeftRadius: bottomCornerRadius,
    borderBottomRightRadius: bottomCornerRadius,
    borderTopLeftRadius: CORNER_RADIUS,
    borderTopRightRadius: CORNER_RADIUS,
  };
  const detents = useMemo<Detent[]>(() => [0, sheetHeight], [sheetHeight]);
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

  useEffect(() => {
    if (!open) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      requestClose();
      return true;
    });

    return () => subscription.remove();
  }, [open, requestClose]);

  const handleIndexChange = useCallback(
    (nextIndex: number) => {
      setIndex(nextIndex === CLOSED_INDEX && !dismissible ? OPEN_INDEX : nextIndex);
    },
    [dismissible],
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
      detents={detents}
      index={index}
      onIndexChange={handleIndexChange}
      onSettle={handleSettle}
      scrimColor={scrimColor}
    >
      <View style={{ height: sheetHeight, width: windowWidth }}>
        <View
          accessibilityElementsHidden={!open}
          accessibilityViewIsModal
          className="self-center overflow-hidden border-continuous bg-background"
          importantForAccessibility={open ? 'yes' : 'no-hide-descendants'}
          onAccessibilityEscape={dismissible ? requestClose : undefined}
          style={[styles.card, cornerStyle, { height: cardHeight, width: cardWidth }]}
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
          </View>
          <View className="min-h-0 flex-1" style={{ paddingBottom: insets.bottom }}>
            {children}
          </View>
        </View>
      </View>
    </ModalBottomSheet>
  );
}

const styles = StyleSheet.create({
  card: {
    borderCurve: 'continuous',
  },
});
