import { Link } from 'expo-router';
import type { ReactNode } from 'react';

import type {
  ArtifactPreviewLinkProps,
  ArtifactPreviewTargetProps,
} from './ArtifactPreviewTransition.types';

/**
 * Keep the pressable child as the native accessibility owner. Expo Router's
 * Apple zoom source currently flattens that child out of the iOS accessibility
 * tree, so accessibility takes precedence over the decorative transition.
 */
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
