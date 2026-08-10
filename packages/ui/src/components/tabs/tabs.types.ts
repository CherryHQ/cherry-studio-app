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

export type TabsProps<TValue extends string> = {
  accessibilityLabel?: string;
  items: readonly TabsItem<TValue>[];
  onValueChange: (value: TValue) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  value: TValue;
};
