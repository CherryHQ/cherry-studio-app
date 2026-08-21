import type { StyleProp, ViewStyle } from 'react-native';

import type { InputProps } from '../input';

export type SecureInputVisibilityAccessibilityLabels = {
  hide: string;
  show: string;
};

export type SecureInputProps = Omit<
  InputProps,
  'autoCapitalize' | 'autoCorrect' | 'multiline' | 'secureTextEntry' | 'selection' | 'style'
> & {
  blurOnVisibilityToggle?: boolean;
  style?: StyleProp<ViewStyle>;
  visibilityAccessibilityLabels: SecureInputVisibilityAccessibilityLabels;
};
