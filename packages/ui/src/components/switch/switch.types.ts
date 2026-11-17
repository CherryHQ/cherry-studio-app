import type { StyleProp, ViewStyle } from 'react-native';

export type SwitchSize = 'default' | 'lg' | 'sm';

export type SwitchProps = {
  accessibilityLabel: string;
  disabled?: boolean;
  /** The value belongs to someone else: shown in the locked style and explained when pressed. */
  locked?: boolean;
  onValueChange: (value: boolean) => void;
  size?: SwitchSize;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  value: boolean;
};
