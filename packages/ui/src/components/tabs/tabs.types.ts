import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type TabsItemState = {
  isDisabled: boolean;
  isSelected: boolean;
};

export type TabsItem<TValue extends string> = {
  children?: ReactNode | ((state: TabsItemState) => ReactNode);
  disabled?: boolean;
  label: string;
  testID?: string;
  value: TValue;
};

/**
 * `fill` spans the parent and splits it into equal segments — the default, and
 * what a control sized by its container wants. `hug` sizes the control to its
 * labels and aligns it to the start, for a filter row that should not stretch
 * across the page.
 */
export type TabsLayout = 'fill' | 'hug';

export type TabsProps<TValue extends string> = {
  accessibilityLabel?: string;
  items: readonly TabsItem<TValue>[];
  layout?: TabsLayout;
  onValueChange: (value: TValue) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  value: TValue;
};
