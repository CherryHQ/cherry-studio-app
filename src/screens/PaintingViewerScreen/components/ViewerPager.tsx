import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useCallback, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { PaintingZoomTarget } from '@/components/navigation';

import { ZoomableImage } from './ZoomableImage';

type ViewerItem = { key: string; uri: string };

// Horizontal, virtualized pager across the whole gallery. Each page zooms
// independently; while any page is zoomed the list stops scrolling so a pan
// moves the image instead of paging away. `onEndReached` lets the screen load
// the next gallery page so swiping keeps going past the initially loaded set.
// `recycleItems` stays off so a zoomed page's transform never bleeds onto a
// recycled neighbour. A horizontal list won't stretch cells on the cross axis,
// so the measured height is threaded into each page as a concrete box.
export function ViewerPager({
  initialIndex,
  items,
  onEndReached,
  onPageChange,
}: {
  initialIndex: number;
  items: readonly ViewerItem[];
  onEndReached: () => void;
  onPageChange: (index: number) => void;
}) {
  const { width } = useWindowDimensions();
  const [isZoomed, setIsZoomed] = useState(false);
  const [height, setHeight] = useState(0);

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<ViewerItem>) => (
      <PaintingZoomTarget sourceKey={item.key}>
        <View collapsable={false} style={{ height, width }}>
          <ZoomableImage height={height} onZoomChange={setIsZoomed} uri={item.uri} width={width} />
        </View>
      </PaintingZoomTarget>
    ),
    [height, width],
  );

  return (
    <View className="flex-1" onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)}>
      {height > 0 ? (
        <LegendList
          className="flex-1"
          data={items}
          estimatedItemSize={width}
          horizontal
          initialScrollIndex={initialIndex}
          keyExtractor={(item) => item.key}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          onMomentumScrollEnd={({ nativeEvent }) => {
            const index = Math.round(nativeEvent.contentOffset.x / width);
            onPageChange(Math.max(0, Math.min(items.length - 1, index)));
          }}
          pagingEnabled
          renderItem={renderItem}
          scrollEnabled={!isZoomed}
          showsHorizontalScrollIndicator={false}
          testID="painting-viewer-pager"
        />
      ) : null}
    </View>
  );
}
