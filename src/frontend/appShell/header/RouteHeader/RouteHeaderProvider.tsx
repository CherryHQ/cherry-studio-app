import { createContext, type PropsWithChildren, use } from 'react';

import type { RouteHeaderRootAction } from './RouteHeader.types';

const RouteHeaderRootActionContext = createContext<RouteHeaderRootAction>('back');

/** Declares the leading action used by the root screen of a route stack. */
export function RouteHeaderProvider({
  children,
  rootAction,
}: PropsWithChildren<{ rootAction: RouteHeaderRootAction }>) {
  return <RouteHeaderRootActionContext value={rootAction}>{children}</RouteHeaderRootActionContext>;
}

export function useRouteHeaderRootAction() {
  return use(RouteHeaderRootActionContext);
}
