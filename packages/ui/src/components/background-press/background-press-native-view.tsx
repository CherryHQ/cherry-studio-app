import { useMemo } from 'react';
import { callback, getHostComponent, type HybridViewMethods } from 'react-native-nitro-modules';
import { withUniwind } from 'uniwind';

import type { BackgroundPressAdapterProps } from './background-press.types';
import type {
  BackgroundPressPhase,
  CherryBackgroundPressViewProps,
} from './specs/cherry-background-press-view.nitro';

const NativeView = withUniwind(
  getHostComponent<CherryBackgroundPressViewProps, HybridViewMethods>(
    'CherryBackgroundPressView',
    () => require('../../../nitrogen/generated/shared/json/CherryBackgroundPressViewConfig.json'),
  ),
);

export function BackgroundPressAdapter({
  onBackgroundPress,
  onBackgroundTouchStart,
  ...props
}: BackgroundPressAdapterProps) {
  // Both phases use one native dispatcher. RN touch events and Nitro callbacks
  // can arrive out of order, so RN onTouchStart must not initialize this gesture.
  const handleInteraction = useMemo(
    () =>
      callback((phase: BackgroundPressPhase) => {
        if (phase === 'start') onBackgroundTouchStart({});
        else onBackgroundPress();
      }),
    [onBackgroundPress, onBackgroundTouchStart],
  );
  return <NativeView {...props} onBackgroundInteraction={handleInteraction} />;
}
