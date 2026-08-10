import { Spinner as HeroSpinner } from 'heroui-native/spinner';
import { forwardRef } from 'react';
import type { View, ViewProps } from 'react-native';

export type SpinnerSize = 'default' | 'lg' | 'sm';
export type SpinnerColor = 'danger' | 'default' | 'success' | 'warning' | (string & {});

export type SpinnerProps = Omit<ViewProps, 'children'> & {
  className?: string;
  color?: SpinnerColor;
  size?: SpinnerSize;
};

const heroSize = {
  default: 'md',
  lg: 'lg',
  sm: 'sm',
} as const;

export const Spinner = forwardRef<View, SpinnerProps>(function Spinner(
  { size = 'default', ...props },
  ref,
) {
  return <HeroSpinner {...props} ref={ref} size={heroSize[size]} />;
});

Spinner.displayName = 'Spinner';
