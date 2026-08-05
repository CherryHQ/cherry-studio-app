import type { StyleProp, TextInputProps, TextStyle } from 'react-native';

export type InputAutoCapitalize = NonNullable<TextInputProps['autoCapitalize']>;

export type InputKeyboardType = NonNullable<TextInputProps['keyboardType']>;

export type InputReturnKeyType = NonNullable<TextInputProps['returnKeyType']>;

export type InputProps = Omit<
  TextInputProps,
  | 'accessibilityLabel'
  | 'autoCapitalize'
  | 'keyboardType'
  | 'onChangeText'
  | 'returnKeyType'
  | 'style'
  | 'value'
> & {
  accessibilityLabel: string;
  autoCapitalize?: InputAutoCapitalize;
  disabled?: boolean;
  invalid?: boolean;
  keyboardType?: InputKeyboardType;
  onChangeText?: (value: string) => void;
  returnKeyType?: InputReturnKeyType;
  style?: StyleProp<TextStyle>;
  value: string;
};
