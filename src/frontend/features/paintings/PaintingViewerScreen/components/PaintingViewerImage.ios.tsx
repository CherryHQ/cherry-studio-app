import { Stack } from 'expo-router';
import { useState } from 'react';

import { ArtifactImageViewer } from '@/frontend/components/artifactPreview';

import type { PaintingViewerImageProps } from './PaintingViewerImage.types';

export function PaintingViewerImage({ accessibilityLabel, uri }: PaintingViewerImageProps) {
  const [isImageZoomed, setIsImageZoomed] = useState(false);

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !isImageZoomed }} />
      <ArtifactImageViewer
        accessibilityLabel={accessibilityLabel}
        onZoomChange={setIsImageZoomed}
        uri={uri}
      />
    </>
  );
}
