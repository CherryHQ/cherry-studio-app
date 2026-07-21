import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { paintingViewer } from '@/config/constants';
import { type PaintingGalleryItem, usePaintingGalleryItems, usePaintings } from '@/hooks/paintings';

import { PaintingViewerChrome } from './components/PaintingViewerChrome';
import { ViewerPager } from './components/ViewerPager';
import { usePaintingViewerActions } from './hooks/usePaintingViewerActions';

export function PaintingViewerScreen() {
  const params = useLocalSearchParams<{
    fileEntryId?: string | string[];
    paintingId?: string | string[];
  }>();
  const paintingId = firstParam(params.paintingId);
  const fileEntryId = firstParam(params.fileEntryId);
  const paintings = usePaintings();
  const gallery = usePaintingGalleryItems(paintings.paintings);
  const items = gallery.data;
  const isLoading = paintings.isLoading || gallery.isLoading;

  if (!items || items.length === 0) {
    return (
      <View className="flex-1 bg-black">
        <StatusBar style="light" />
        <View className="flex-1 items-center justify-center">
          {isLoading ? <ActivityIndicator color="#ffffff" /> : null}
        </View>
      </View>
    );
  }

  const initialIndex = Math.max(
    0,
    items.findIndex((item) => item.key === `${paintingId}:${fileEntryId}`),
  );

  return (
    <View className="flex-1 bg-black">
      <StatusBar style="light" />
      <PaintingViewerContent
        initialIndex={initialIndex}
        items={items}
        onLoadMore={paintings.loadMore}
      />
    </View>
  );
}

function PaintingViewerContent({
  initialIndex,
  items,
  onLoadMore,
}: {
  initialIndex: number;
  items: readonly PaintingGalleryItem[];
  onLoadMore: () => void;
}) {
  const router = useRouter();
  const [pageIndex, setPageIndex] = useState(initialIndex);
  const current = items[Math.min(pageIndex, items.length - 1)] ?? items[0];
  const actions = usePaintingViewerActions({
    currentOutput: { fileEntryId: current.fileEntryId, uri: current.uri },
    painting: current.painting,
  });

  return (
    <>
      <PaintingViewerChrome
        aspectRatios={paintingViewer.aspectRatios}
        onClose={router.back}
        onDelete={() => void actions.remove()}
        onDownload={() => void actions.download()}
        onEdit={actions.edit}
        onResizeSelect={actions.resize}
      />
      <Link.AppleZoomTarget>
        <View className="flex-1">
          <ViewerPager
            initialIndex={initialIndex}
            items={items}
            onEndReached={onLoadMore}
            onPageChange={setPageIndex}
          />
        </View>
      </Link.AppleZoomTarget>
    </>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
