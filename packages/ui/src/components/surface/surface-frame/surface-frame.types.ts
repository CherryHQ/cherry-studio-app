import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type SurfaceFrameProps = {
  children?: ReactNode;
  className: string;
  cornerRadius: number;
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  tintColor?: string;
};
