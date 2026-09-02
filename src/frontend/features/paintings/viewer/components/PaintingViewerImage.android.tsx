import { ArtifactImageViewer } from '@/frontend/components/ArtifactPreview';

import type { PaintingViewerImageProps } from './PaintingViewerImage.types';

export function PaintingViewerImage({ accessibilityLabel, uri }: PaintingViewerImageProps) {
  return <ArtifactImageViewer accessibilityLabel={accessibilityLabel} uri={uri} />;
}
