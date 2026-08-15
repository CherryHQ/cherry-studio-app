import { Link } from 'expo-router';
import type { ReactNode } from 'react';

import type {
  PaintingZoomLinkProps,
  PaintingZoomTargetProps,
} from './PaintingZoomTransition.types';

export function PaintingZoomLink({ children, fileEntryId, paintingId }: PaintingZoomLinkProps) {
  return (
    <Link
      asChild
      href={{
        pathname: '/paintings/[paintingId]',
        params: { fileEntryId, paintingId },
      }}
    >
      {children}
    </Link>
  );
}

export function PaintingZoomTarget({ children }: PaintingZoomTargetProps): ReactNode {
  return children;
}
