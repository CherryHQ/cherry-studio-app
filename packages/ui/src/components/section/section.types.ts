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

export type SectionHeaderProps = Omit<ViewProps, 'children'> & {
  children?: ReactNode;
  className?: string;
  title: ReactNode;
  titleClassName?: string;
};

type SectionItemBaseProps = AccessibilityProps & {
  className?: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  onPressIn?: PressableProps['onPressIn'];
  onPressOut?: PressableProps['onPressOut'];
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

type SectionItemSlotsProps = {
  children?: never;
  description?: ReactNode;
  label: ReactNode;
  leading?: ReactNode;
  showChevron?: boolean;
  trailing?: ReactNode;
};

type SectionItemCustomProps = {
  children: ReactNode;
  description?: never;
  label?: never;
  leading?: never;
  showChevron?: never;
  trailing?: never;
};

export type SectionItemProps = SectionItemBaseProps &
  (SectionItemSlotsProps | SectionItemCustomProps);

export type SectionRadioItemProps = Omit<
  SectionItemBaseProps,
  'accessibilityRole' | 'accessibilityState' | 'onPress'
> & {
  description?: ReactNode;
  label: ReactNode;
  leading?: ReactNode;
  onPress: () => void;
  selected: boolean;
};
