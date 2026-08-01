import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { paintingViewer } from '@/frontend/utils/constants';
import type { Painting } from '@cherrystudio/shared/data/types/painting';
import {
  type ResolvedPaintingAttachment,
  usePainting,
  useResolvedPaintingFiles,
} from '../hooks/usePaintings';

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
  const painting = usePainting(paintingId);
  const files = useResolvedPaintingFiles(painting.data);
  const current = files.data?.outputs.find((output) => output.fileEntryId === fileEntryId);

  if (!painting.data || !current) {
    return (
      <View className="flex-1 bg-black">
        <StatusBar style="light" />
        <View className="flex-1 items-center justify-center">
          {painting.isLoading || files.isLoading ? <ActivityIndicator color="#ffffff" /> : null}
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <StatusBar style="light" />
      <PaintingViewerContent current={current} painting={painting.data} />
    </View>
  );
}

function PaintingViewerContent({
  current,
  painting,
}: {
  current: ResolvedPaintingAttachment;
  painting: Painting;
}) {
  const router = useRouter();
  const actions = usePaintingViewerActions({
    currentOutput: current,
    painting,
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
        <ViewerImage uri={current.uri} />
      </View>
    </>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
