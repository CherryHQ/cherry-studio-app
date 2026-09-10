import { Portal as HeroPortal } from 'heroui-native/portal';
import type { ComponentProps } from 'react';

import { PortalAccessibilityBoundary } from './portal-accessibility';

export type PortalProps = ComponentProps<typeof HeroPortal>;

function PortalRoot(props: PortalProps) {
  return <HeroPortal {...props} />;
}

export const Portal = Object.assign(PortalRoot, {
  AccessibilityBoundary: PortalAccessibilityBoundary,
});
