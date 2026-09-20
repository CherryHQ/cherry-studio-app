import { Stack, useIsPreview } from 'expo-router';
import { View } from 'react-native';

import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

import { HeaderAction } from '../HeaderAction';
import type { HeaderActionGroupProps } from './HeaderActionGroup';

/** Delegates the action surface and adjacent-item grouping to the iOS native toolbar. */
export function HeaderActionGroup({ actions, placement, tone }: HeaderActionGroupProps) {
  const isPreview = useIsPreview();

  if (isPreview || actions.length === 0) {
    return null;
  }

  const actionSurfaceClassName = isLiquidGlassAvailable
    ? undefined
    : tone === 'inverse'
      ? 'rounded-full bg-constant-black/55'
      : 'rounded-full bg-card/70';

  return (
    <Stack.Toolbar placement={placement}>
      {/* Expo converts toolbar children before rendering them, so View stays direct here. */}
      {actions.map((action) => (
        <Stack.Toolbar.View key={action.key}>
          <View className={actionSurfaceClassName}>
            <HeaderAction action={action} tone={tone} />
          </View>
        </Stack.Toolbar.View>
      ))}
    </Stack.Toolbar>
  );
}
