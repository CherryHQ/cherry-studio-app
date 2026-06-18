import type { StackToolbarButtonProps } from 'expo-router';

export type CloseHeaderAction = Pick<
  StackToolbarButtonProps,
  'accessibilityLabel' | 'disabled' | 'hidden' | 'onPress' | 'tintColor' | 'variant'
> & {
  key: string;
  label: string;
};

export type CloseHeaderProps = {
  onClose?: () => void;
  rightActions?: readonly CloseHeaderAction[];
  title?: string;
};
