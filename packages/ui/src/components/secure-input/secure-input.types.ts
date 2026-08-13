import type { InputProps } from '../input';

export type SecureInputVisibilityAccessibilityLabels = {
  hide: string;
  show: string;
};

export type SecureInputProps = Omit<
  InputProps,
  'autoCapitalize' | 'autoCorrect' | 'multiline' | 'secureTextEntry'
> & {
  blurOnVisibilityToggle?: boolean;
  visibilityAccessibilityLabels: SecureInputVisibilityAccessibilityLabels;
};
