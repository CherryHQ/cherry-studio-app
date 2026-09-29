import type { HybridView, HybridViewMethods, HybridViewProps } from 'react-native-nitro-modules';

export type BackgroundPressMode = 'background' | 'exclusion';

export interface CherryBackgroundPressViewProps extends HybridViewProps {
  enabled: boolean;
  mode: BackgroundPressMode;
  onBackgroundPress: () => void;
}

export type CherryBackgroundPressView = HybridView<
  CherryBackgroundPressViewProps,
  HybridViewMethods
>;
