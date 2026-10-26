import type { Ref } from 'react';
import type { ViewInstance, ViewProps } from 'react-native';

import { SpinnerControl } from './spinner-control/spinner-control';

export type SpinnerSize = 'default' | 'lg' | 'sm';
export type SpinnerColor = 'danger' | 'default' | 'success' | 'warning' | (string & {});

export type SpinnerProps = Omit<ViewProps, 'children'> & {
  className?: string;
  color?: SpinnerColor;
  size?: SpinnerSize;
  ref?: Ref<ViewInstance>;
};

export function Spinner(props: SpinnerProps) {
  return <SpinnerControl {...props} />;
}
