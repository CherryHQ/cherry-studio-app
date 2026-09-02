import { Link } from 'expo-router';
import type { ReactNode } from 'react';

import type {
  ArtifactPreviewLinkProps,
  ArtifactPreviewTargetProps,
} from './ArtifactPreviewTransition.types';

export function ArtifactPreviewLink({ children, href }: ArtifactPreviewLinkProps) {
  return (
    <Link asChild href={href}>
      {children}
    </Link>
  );
}

export function ArtifactPreviewTarget({ children }: ArtifactPreviewTargetProps): ReactNode {
  return children;
}
