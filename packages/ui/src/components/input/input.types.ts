import type { Ref } from 'react';
import type { StyleProp, TextInput, TextInputProps, TextStyle, ViewStyle } from 'react-native';

export type InputAutoCapitalize = NonNullable<TextInputProps['autoCapitalize']>;

export type InputKeyboardType = NonNullable<TextInputProps['keyboardType']>;

export type InputReturnKeyType = NonNullable<TextInputProps['returnKeyType']>;

type InputBaseProps = Omit<
  TextInputProps,
  | 'accessibilityLabel'
  | 'autoCapitalize'
  | 'keyboardType'
  | 'onChangeText'
  | 'returnKeyType'
  | 'secureTextEntry'
  | 'style'
  | 'type'
  | 'value'
> & {
  accessibilityLabel: string;
  autoCapitalize?: InputAutoCapitalize;
  disabled?: boolean;
  invalid?: boolean;
  keyboardType?: InputKeyboardType;
  onChangeText?: (value: string) => void;
  ref?: Ref<TextInput>;
  returnKeyType?: InputReturnKeyType;
  value: string;
};

export type InputPasswordVisibilityAccessibilityLabels = {
  hide: string;
  show: string;
};

export type InputTextProps = InputBaseProps & {
  blurOnVisibilityToggle?: never;
  style?: StyleProp<TextStyle>;
  type?: 'text';
  visibilityAccessibilityLabels?: never;
};

export type InputPasswordProps = Omit<
  InputBaseProps,
  'autoCapitalize' | 'autoCorrect' | 'multiline' | 'selection'
> & {
  blurOnVisibilityToggle?: boolean;
  style?: StyleProp<ViewStyle>;
  type: 'password';
  visibilityAccessibilityLabels: InputPasswordVisibilityAccessibilityLabels;
};

export type InputProps = InputPasswordProps | InputTextProps;
