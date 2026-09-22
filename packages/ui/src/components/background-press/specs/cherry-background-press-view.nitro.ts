import type { HybridView, HybridViewMethods, HybridViewProps } from 'react-native-nitro-modules';

export type BackgroundPressPhase = 'start' | 'press';

export type BackgroundPressMode = 'background' | 'exclusion';

export interface CherryBackgroundPressViewProps extends HybridViewProps {
  enabled: boolean;
  mode: BackgroundPressMode;
  onBackgroundInteraction: (phase: BackgroundPressPhase) => void;
}

export type CherryBackgroundPressView = HybridView<
  CherryBackgroundPressViewProps,
  HybridViewMethods
>;
