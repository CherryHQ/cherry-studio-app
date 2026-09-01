import { Stack, useIsPreview } from 'expo-router';

import { HeaderAction } from '../HeaderAction';
import type { HeaderActionGroupProps } from './HeaderActionGroup';

/** Delegates the action surface and adjacent-item grouping to the iOS native toolbar. */
export function HeaderActionGroup({ actions, placement, tone }: HeaderActionGroupProps) {
  const isPreview = useIsPreview();

  if (isPreview || actions.length === 0) {
    return null;
  }

  return (
    <Stack.Toolbar placement={placement}>
      {/* Expo converts toolbar children before rendering them, so View stays direct here. */}
      {actions.map((action) => (
        <Stack.Toolbar.View key={action.key}>
          <HeaderAction action={action} tone={tone} />
        </Stack.Toolbar.View>
      ))}
    </Stack.Toolbar>
  );
}
