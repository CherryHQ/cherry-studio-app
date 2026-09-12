import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { View } from 'react-native';

const PortalAccessibilityContext = createContext<(() => () => void) | null>(null);

/** Wrap app content below the portal host's provider; portalled content stays outside this View. */
export function PortalAccessibilityBoundary({ children }: PropsWithChildren) {
  const [activeOverlays, setActiveOverlays] = useState(0);
  const hideBackground = useCallback(() => {
    setActiveOverlays((count) => count + 1);
    return () => setActiveOverlays((count) => count - 1);
  }, []);

  return (
    <PortalAccessibilityContext value={hideBackground}>
      <View
        accessibilityElementsHidden={activeOverlays > 0}
        className="flex-1"
        // Isolation toggles Fabric's view-flattening eligibility. Keep this
        // ancestor mounted so opening/closing a popover cannot reparent the
        // focused editor and detach it from the native responder chain.
        collapsable={false}
        importantForAccessibility={activeOverlays > 0 ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
    </PortalAccessibilityContext>
  );
}

/** Register before portalling, where the caller still has the boundary's context. */
export function usePortalBackgroundIsolation(active: boolean) {
  const hideBackground = use(PortalAccessibilityContext);
  useEffect(() => {
    if (!active) return;
    if (!hideBackground)
      throw new Error('An accessible popover requires Portal.AccessibilityBoundary.');
    return hideBackground();
  }, [active, hideBackground]);
}
