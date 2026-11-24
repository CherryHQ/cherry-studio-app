import type { PropsWithChildren } from 'react';

import { RouteHeaderProvider, type RouteHeaderRootAction } from '@/frontend/appShell/header';

import type { NavDestinationId } from './navRouteManifest';
import { useOptionalNavigationShell } from './state';

/** Resolves a top-level route stack's leading button from its own destination rather than global pathname. */
export function resolveRouteHeaderRootAction(
  destination: NavDestinationId,
  shellMode: 'compact-dock' | 'wide-rail' | 'vertical-rail',
  pinnedTabs: readonly string[],
): RouteHeaderRootAction {
  if (shellMode === 'wide-rail') {
    return destination === 'chat' ? 'drawer' : 'none';
  }
  if (destination === 'chat' || destination === 'more') {
    return 'drawer';
  }
  if (destination === 'settings') {
    return 'back';
  }
  return pinnedTabs.includes(destination) ? 'drawer' : 'back';
}

/** Scopes RouteHeader root leading behavior per nested Stack so background roots stay steady on pop. */
export function NavRouteHeaderScope({
  children,
  destination,
}: PropsWithChildren<{ destination: NavDestinationId }>) {
  const shell = useOptionalNavigationShell();
  const rootAction = shell
    ? resolveRouteHeaderRootAction(destination, shell.shellMode, shell.pinnedTabs)
    : destination === 'chat'
      ? 'drawer'
      : 'back';

  return <RouteHeaderProvider rootAction={rootAction}>{children}</RouteHeaderProvider>;
}
