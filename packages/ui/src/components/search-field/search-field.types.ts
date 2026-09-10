import type { Ref } from 'react';
import type { StyleProp, TextInput, ViewStyle } from 'react-native';

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
  ref?: Ref<TextInput>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  value: string;
  variant?: 'default' | 'filled';
};
