import type { ReactNode } from 'react';
import type {
  AccessibilityProps,
  PressableProps,
  StyleProp,
  ViewProps,
  ViewStyle,
} from 'react-native';

export type SectionProps = Omit<ViewProps, 'children'> & {
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  footer?: ReactNode;
  title?: ReactNode;
};

export type SectionItemProps = AccessibilityProps & {
  className?: string;
  description?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  label: ReactNode;
  leading?: ReactNode;
  onPress?: () => void;
  onPressIn?: PressableProps['onPressIn'];
  onPressOut?: PressableProps['onPressOut'];
  showChevron?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  trailing?: ReactNode;
};
