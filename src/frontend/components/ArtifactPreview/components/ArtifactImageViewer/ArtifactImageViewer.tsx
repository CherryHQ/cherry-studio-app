import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { ArtifactPreviewTarget } from '../ArtifactPreviewTransition/ArtifactPreviewTransition';
import { ZoomableImage } from './ZoomableImage';

export function ArtifactImageViewer({
  accessibilityLabel,
  onZoomChange,
  uri,
}: {
  accessibilityLabel: string;
  onZoomChange?: (isZoomed: boolean) => void;
  uri: string;
}) {
  const { width } = useWindowDimensions();
  const [height, setHeight] = useState(0);

  return (
    <ArtifactPreviewTarget>
      <View className="flex-1" onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)}>
        {height > 0 ? (
          <ZoomableImage
            accessibilityLabel={accessibilityLabel}
            height={height}
            onZoomChange={onZoomChange}
            uri={uri}
            width={width}
          />
        ) : null}
      </View>
    </ArtifactPreviewTarget>
  );
}
