import { Stack } from 'expo-router';
import { useState } from 'react';

import type { PaintingViewerImageProps } from './PaintingViewerImage.types';
import { ViewerImage } from './ViewerImage';

export function PaintingViewerImage({ uri }: PaintingViewerImageProps) {
  const [isImageZoomed, setIsImageZoomed] = useState(false);

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !isImageZoomed }} />
      <ViewerImage onZoomChange={setIsImageZoomed} uri={uri} />
    </>
  );
}
