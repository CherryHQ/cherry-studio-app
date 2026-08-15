import { Link } from 'expo-router';
import type { ReactNode } from 'react';

import type {
  PaintingZoomLinkProps,
  PaintingZoomTargetProps,
} from '../paintingZoomTransition.types';

/** Native zoom transition between a gallery thumbnail and its full-screen viewer. */
export function PaintingZoomLink({ children, fileEntryId, paintingId }: PaintingZoomLinkProps) {
  return (
    <Link
      asChild
      href={{
        pathname: '/paintings/[paintingId]',
        params: { fileEntryId, paintingId },
      }}
    >
      <Link.AppleZoom>{children}</Link.AppleZoom>
    </Link>
  );
}

export function PaintingZoomTarget({ children }: PaintingZoomTargetProps): ReactNode {
  return <Link.AppleZoomTarget>{children}</Link.AppleZoomTarget>;
}
