import {
  createContext,
  type PropsWithChildren,
  use,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { createOverlayNavigation } from './overlay-navigation-controller';

const OverlayNavigationContext = createContext<ReturnType<typeof createOverlayNavigation> | null>(
  null,
);

/** Coordinates app-wide navigation with the surfaces that own presentation and dismissal. */
export function OverlayNavigationProvider({ children }: PropsWithChildren) {
  const [controller] = useState(createOverlayNavigation);
  return <OverlayNavigationContext value={controller}>{children}</OverlayNavigationContext>;
}

export function useOverlayNavigation() {
  const controller = use(OverlayNavigationContext);
  if (!controller) throw new Error('OverlayNavigationProvider is missing');
  return controller;
}

/** No dismiss action means a decision must be completed before navigation can take over. */
export function useNavigationOverlay(active: boolean, dismiss?: () => void) {
  const controller = use(OverlayNavigationContext);
  const dismissRef = useRef(dismiss);
  useLayoutEffect(() => {
    dismissRef.current = dismiss;
  });
  const canDismiss = dismiss !== undefined;
  useLayoutEffect(() => {
    if (!active || !controller) return;
    return controller.register(canDismiss ? () => dismissRef.current?.() : undefined);
  }, [active, canDismiss, controller]);
}
