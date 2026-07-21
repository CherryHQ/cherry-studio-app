import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';

import { paintingViewer } from '@/config/constants';
import { type PaintingGalleryItem, usePaintingGalleryItems, usePaintings } from '@/hooks/paintings';

import { PaintingViewerChrome } from './components/PaintingViewerChrome';
import { ViewerImage } from './components/ViewerImage';
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
  const current = items?.find((item) => item.key === `${paintingId}:${fileEntryId}`);

  if (!current) {
    return (
      <View className="flex-1 bg-black">
        <StatusBar style="light" />
        <View className="flex-1 items-center justify-center">
          {isLoading ? <ActivityIndicator color="#ffffff" /> : null}
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <StatusBar style="light" />
      <PaintingViewerContent current={current} />
    </View>
  );
}

function PaintingViewerContent({ current }: { current: PaintingGalleryItem }) {
  const router = useRouter();
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
        onViewConversation={actions.viewConversation}
      />
      <View className="flex-1">
        <ViewerImage sourceKey={current.key} uri={current.uri} />
      </View>
    </>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
