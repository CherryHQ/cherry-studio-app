import type { Detent } from '@swmansion/react-native-bottom-sheet';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

export type BottomSheetCloseReason = 'controlled' | 'dismiss' | (string & {});

export type BottomSheetGeometry = {
  bottomCornerRadius: number;
  insets: EdgeInsets;
  outerInset: number;
  sheetWidth: number;
  topCornerRadius: number;
};

export type BottomSheetContextValue = {
  geometry: BottomSheetGeometry;
  isClosing: boolean;
  requestClose: (reason?: BottomSheetCloseReason) => void;
};

export type BottomSheetProps = {
  backAccessibilityLabel?: string;
  children: ReactNode;
  closeAccessibilityLabel?: string;
  detents?: Detent[];
  headerRight?: ReactNode;
  height?: number;
  isCloseDisabled?: boolean;
  isOpen?: boolean;
  onBack?: () => void;
  onClose: (reason: BottomSheetCloseReason) => void;
  testID?: string;
  title?: ReactNode;
};

export type BottomSheetPageTransitionProps = {
  children: ReactNode;
  /** Current stack depth. Increasing pushes forward; decreasing pops backward. */
  depth: number;
  /** Stable identity of the current page. A same-depth change is treated as replacement. */
  pageKey: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};
