import { useMemo } from 'react';

import type { HeaderToolbarAction } from '../components/HeaderAction';
import { HeaderChrome } from '../components/HeaderChrome';
import type { RouteHeaderProps } from './RouteHeader.types';
import { useRouteHeaderLeadingAction } from './useRouteHeaderLeadingAction';

/** Shared page header whose leading behavior is owned by the active route stack. */
export function RouteHeader({
  leftActions,
  onBack,
  rightActions,
  title = '',
  titleElement,
}: RouteHeaderProps) {
  const leadingAction = useRouteHeaderLeadingAction(onBack);
  const defaultLeftActions = useMemo<HeaderToolbarAction[]>(() => [leadingAction], [leadingAction]);

  return (
    <HeaderChrome
      leftActions={leftActions && leftActions.length > 0 ? leftActions : defaultLeftActions}
      rightActions={rightActions}
      title={title}
      titleAlign="center"
      titleElement={titleElement}
    />
  );
}

export type { RouteHeaderProps, RouteHeaderRootAction } from './RouteHeader.types';
