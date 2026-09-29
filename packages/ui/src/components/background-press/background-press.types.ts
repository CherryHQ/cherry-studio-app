import type { ViewProps } from 'react-native';

export type BackgroundPressAreaProps = ViewProps & {
  disabled?: boolean;
  onPress: () => void;
};

export type BackgroundPressAdapterProps = ViewProps & {
  enabled: boolean;
  mode: 'background' | 'exclusion';
  onBackgroundPress: () => void;
};
