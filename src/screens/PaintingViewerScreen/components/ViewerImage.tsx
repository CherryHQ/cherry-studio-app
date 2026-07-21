import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { PaintingZoomTarget } from '@/components/navigation';

import { ZoomableImage } from './ZoomableImage';

// The viewer shows exactly the image navigated to — there is no swipe to a
// neighbour, so viewing another gallery image means going back and opening
// its own PaintingZoomLink. A horizontal list won't stretch a cell on the
// cross axis, so the same reasoning applies here: the concrete box comes from
// this container's onLayout rather than `100%`.
export function ViewerImage({ sourceKey, uri }: { sourceKey: string; uri: string }) {
  const { width } = useWindowDimensions();
  const [height, setHeight] = useState(0);

  return (
    <PaintingZoomTarget sourceKey={sourceKey}>
      <View className="flex-1" onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)}>
        {height > 0 ? (
          <ZoomableImage height={height} onZoomChange={() => {}} uri={uri} width={width} />
        ) : null}
      </View>
    </PaintingZoomTarget>
  );
}
