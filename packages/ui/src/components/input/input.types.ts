import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

export type InputAutoCapitalize = 'characters' | 'none' | 'sentences' | 'words';

export type InputKeyboardType =
  | 'ascii-capable'
  | 'decimal-pad'
  | 'default'
  | 'email-address'
  | 'name-phone-pad'
  | 'numbers-and-punctuation'
  | 'numeric'
  | 'phone-pad'
  | 'twitter'
  | 'url'
  | 'web-search';

export type InputReturnKeyType = 'done' | 'go' | 'join' | 'next' | 'route' | 'search' | 'send';

export type InputProps = {
  accessibilityLabel: string;
  autoCapitalize?: InputAutoCapitalize;
  autoCorrect?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  keyboardType?: InputKeyboardType;
  maxLength?: number;
  onBlur?: () => void;
  onChangeText: (value: string) => void;
  onFocus?: () => void;
  onSubmitEditing?: () => void;
  placeholder?: string;
  returnKeyType?: InputReturnKeyType;
  secureTextEntry?: boolean;
  style?: StyleProp<TextStyle & ViewStyle>;
  testID?: string;
  value: string;
};
