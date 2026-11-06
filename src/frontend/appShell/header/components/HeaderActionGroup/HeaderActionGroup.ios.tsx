import { Stack, useIsPreview } from 'expo-router';

import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

import { renderHeaderToolbarItem } from '../HeaderAction';
import type { HeaderActionGroupProps } from './HeaderActionGroup';

/** Delegates the action surface and adjacent-item grouping to the iOS native toolbar. */
export function HeaderActionGroup({ actions, placement, tone }: HeaderActionGroupProps) {
  const isPreview = useIsPreview();

  if (isPreview || actions.length === 0) {
    return null;
  }

  const surfaceClassName = isLiquidGlassAvailable
    ? undefined
    : tone === 'inverse'
      ? 'rounded-full bg-constant-black/55'
      : 'rounded-full bg-card/70';

  return (
    <Stack.Toolbar placement={placement}>
      {actions.map((action) => renderHeaderToolbarItem(action, { surfaceClassName, tone }))}
    </Stack.Toolbar>
  );
}
