import type { ReactNode } from 'react';
import type { AccessibilityProps, PressableProps, ViewProps } from 'react-native';

export type SectionProps = Omit<ViewProps, 'children'> & {
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  footer?: ReactNode;
  title?: ReactNode;
  variant?: SectionVariant;
};

export type SectionVariant = 'grouped' | 'plain';

export type SectionHeaderProps = Omit<ViewProps, 'children' | 'className' | 'style'> & {
  children?: ReactNode;
  title: ReactNode;
};

type SectionItemBaseProps = AccessibilityProps & {
  density?: SectionItemDensity;
  destructive?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  onPressIn?: PressableProps['onPressIn'];
  onPressOut?: PressableProps['onPressOut'];
  testID?: string;
};

export type SectionItemDensity = 'compact' | 'comfortable' | 'default';

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

export type SectionSwitchItemProps = Omit<
  SectionItemBaseProps,
  'accessibilityRole' | 'accessibilityState' | 'onPress'
> & {
  description?: ReactNode;
  label: ReactNode;
  leading?: ReactNode;
  onValueChange: (value: boolean) => void;
  value: boolean;
};

export type SectionSelectItemProps = Omit<
  SectionItemBaseProps,
  'accessibilityRole' | 'accessibilityState' | 'onPress'
> & {
  description?: ReactNode;
  label: ReactNode;
  leading?: ReactNode;
  onPress: () => void;
  value: ReactNode;
  valueLeading?: ReactNode;
};
