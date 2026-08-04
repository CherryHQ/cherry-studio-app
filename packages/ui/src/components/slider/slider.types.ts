import type { StyleProp, ViewStyle } from 'react-native';

export type SliderProps = {
  accessibilityLabel: string;
  disabled?: boolean;
  max?: number;
  min?: number;
  onValueChange: (value: number) => void;
  step?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  value: number;
};
