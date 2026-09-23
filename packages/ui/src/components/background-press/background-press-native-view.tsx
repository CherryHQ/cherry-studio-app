import { useMemo } from 'react';
import { callback, getHostComponent, type HybridViewMethods } from 'react-native-nitro-modules';
import { withUniwind } from 'uniwind';

import type { BackgroundPressAdapterProps } from './background-press.types';
import type { CherryBackgroundPressViewProps } from './specs/cherry-background-press-view.nitro';

const NativeView = withUniwind(
  getHostComponent<CherryBackgroundPressViewProps, HybridViewMethods>(
    'CherryBackgroundPressView',
    () => require('../../../nitrogen/generated/shared/json/CherryBackgroundPressViewConfig.json'),
  ),
);

export function BackgroundPressAdapter({
  onBackgroundPress,
  ...props
}: BackgroundPressAdapterProps) {
  const handlePress = useMemo(() => callback(onBackgroundPress), [onBackgroundPress]);
  return <NativeView {...props} onBackgroundPress={handlePress} />;
}
