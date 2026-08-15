import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { PaintingZoomTarget } from '@/frontend/components/navigation';

import { ZoomableImage } from './ZoomableImage';

// Use the measured container height because `100%` is not reliable through the
// shared-element transition wrapper.
export function ViewerImage({
  onZoomChange,
  uri,
}: {
  onZoomChange?: (isZoomed: boolean) => void;
  uri: string;
}) {
  const { width } = useWindowDimensions();
  const [height, setHeight] = useState(0);

  return (
    <PaintingZoomTarget>
      <View className="flex-1" onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)}>
        {height > 0 ? (
          <ZoomableImage height={height} onZoomChange={onZoomChange} uri={uri} width={width} />
        ) : null}
      </View>
    </PaintingZoomTarget>
  );
}
