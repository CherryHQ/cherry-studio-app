import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { paintingViewer } from '@/config/constants';
import type { Painting } from '@/data/types/painting';
import { usePainting, useResolvedPaintingFiles } from '@/hooks/paintings';

import { PaintingViewerChrome } from './components/PaintingViewerChrome';
import { ViewerPager } from './components/ViewerPager';
import { usePaintingViewerActions } from './hooks/usePaintingViewerActions';

export function PaintingViewerScreen() {
  const params = useLocalSearchParams<{
    fileEntryId?: string | string[];
    paintingId?: string | string[];
  }>();
  const paintingId = firstParam(params.paintingId);
  const initialFileEntryId = firstParam(params.fileEntryId);
  const paintingQuery = usePainting(paintingId);
  const painting = paintingQuery.data;
  const filesQuery = useResolvedPaintingFiles(painting);
  const outputs = filesQuery.data?.outputs ?? [];
  const initialIndex = Math.max(
    0,
    outputs.findIndex((output) => output.fileEntryId === initialFileEntryId),
  );
  const [pageIndex, setPageIndex] = useState(initialIndex);
  const isLoading = paintingQuery.isLoading || filesQuery.isLoading;

  return (
    <View className="flex-1 bg-black">
      <StatusBar style="light" />
      {isLoading || !painting || outputs.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          {isLoading ? <ActivityIndicator color="#ffffff" /> : null}
        </View>
      ) : (
        <PaintingViewerContent
          currentOutput={outputs[pageIndex]}
          initialIndex={initialIndex}
          onPageChange={setPageIndex}
          outputs={outputs}
          painting={painting}
        />
      )}
    </View>
  );
}

function PaintingViewerContent({
  currentOutput,
  initialIndex,
  onPageChange,
  outputs,
  painting,
}: {
  currentOutput: { fileEntryId: string; uri: string } | undefined;
  initialIndex: number;
  onPageChange: (index: number) => void;
  outputs: { fileEntryId: string; uri: string }[];
  painting: Painting;
}) {
  const router = useRouter();
  const actions = usePaintingViewerActions({ currentOutput, painting });

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
          <ViewerPager initialIndex={initialIndex} onPageChange={onPageChange} outputs={outputs} />
        </View>
      </Link.AppleZoomTarget>
    </>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
