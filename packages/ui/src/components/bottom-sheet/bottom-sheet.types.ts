import type { Detent } from '@swmansion/react-native-bottom-sheet';
import type { ReactNode } from 'react';
import type {
  PressableProps,
  ScrollViewProps,
  StyleProp,
  TextProps,
  ViewProps,
  ViewStyle,
} from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

import type { SearchFieldProps } from '../search-field';

export type BottomSheetCloseReason = 'controlled' | 'dismiss' | (string & {});

export type BottomSheetGeometry = {
  bottomCornerRadius: number;
  insets: EdgeInsets;
  /** The card measures to its children instead of to a height `Content` imposed. */
  isContentSized: boolean;
  outerInset: number;
  sheetWidth: number;
  topCornerRadius: number;
};

export type BottomSheetContextValue = {
  geometry: BottomSheetGeometry;
  isCloseDisabled: boolean;
  isClosing: boolean;
  requestClose: (reason?: BottomSheetCloseReason) => void;
  testID?: string;
};

export type BottomSheetRootProps = {
  children: ReactNode;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
};

export type BottomSheetContentProps = {
  children: ReactNode;
  detents?: Detent[];
  height?: number;
  isCloseDisabled?: boolean;
  onClose?: (reason: BottomSheetCloseReason) => void;
  testID?: string;
};

export type BottomSheetTriggerProps = PressableProps & {
  children: ReactNode;
};

export type BottomSheetHeaderProps = ViewProps & {
  children: ReactNode;
};

export type BottomSheetTitleProps = TextProps & {
  children: ReactNode;
};

export type BottomSheetBackButtonProps = Omit<PressableProps, 'children' | 'onPress'> & {
  accessibilityLabel: string;
  onPress: () => void;
};

export type BottomSheetCloseButtonProps = Omit<PressableProps, 'children' | 'onPress'> & {
  accessibilityLabel: string;
};

export type BottomSheetBodyProps = ViewProps;
export type BottomSheetFooterProps = ViewProps;
export type BottomSheetScrollViewProps = ScrollViewProps;
export type BottomSheetSearchFieldProps = SearchFieldProps;

export type BottomSheetSelectionOption<TValue extends string> = {
  label: string;
  value: TValue;
};

export type BottomSheetSelectionProps<TValue extends string> = {
  closeAccessibilityLabel: string;
  defaultOpen?: boolean;
  emptyText: string;
  heightFraction?: number;
  onClose: () => void;
  onOpenChange?: (open: boolean) => void;
  onSelect: (value: TValue) => void;
  open?: boolean;
  options: readonly BottomSheetSelectionOption<TValue>[];
  selectedValue: TValue | null;
  testID: string;
  title: string;
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
