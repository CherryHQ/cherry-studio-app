import { Portal as HeroPortal } from 'heroui-native/portal';
import type { ComponentProps } from 'react';

export type PortalProps = ComponentProps<typeof HeroPortal>;

export function Portal(props: PortalProps) {
  return <HeroPortal {...props} />;
}
