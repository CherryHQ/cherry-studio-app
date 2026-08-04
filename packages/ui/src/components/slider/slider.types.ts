import type { StyleProp, ViewStyle } from 'react-native';

export type SliderProps = {
  accessibilityLabel: string;
  disabled?: boolean;
  max?: number;
  maximumValueLabel?: string;
  min?: number;
  minimumValueLabel?: string;
  onValueChange: (value: number) => void;
  step?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  value: number;
};
