import { Link } from 'expo-router';
import type { ReactNode } from 'react';

import type {
  ArtifactPreviewLinkProps,
  ArtifactPreviewTargetProps,
} from './ArtifactPreviewTransition.types';

/** Native zoom transition between an artifact preview and its viewer. */
export function ArtifactPreviewLink({ children, href }: ArtifactPreviewLinkProps) {
  return (
    <Link asChild href={href}>
      <Link.AppleZoom>{children}</Link.AppleZoom>
    </Link>
  );
}

export function ArtifactPreviewTarget({ children }: ArtifactPreviewTargetProps): ReactNode {
  return <Link.AppleZoomTarget>{children}</Link.AppleZoomTarget>;
}
