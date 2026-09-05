import type { StyleProp, ViewStyle } from 'react-native';

export type SearchFieldProps = {
  accessibilityLabel: string;
  autoFocus?: boolean;
  clearAccessibilityLabel: string;
  disabled?: boolean;
  onBlur?: () => void;
  onChangeText: (value: string) => void;
  onClear?: () => void;
  onFocus?: () => void;
  onSubmitEditing?: () => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  value: string;
};
