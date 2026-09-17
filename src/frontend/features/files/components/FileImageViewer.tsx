import { ContentState } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ArtifactImagePages, ArtifactImageViewer } from '@/frontend/components/ArtifactPreview';
import { queryKeys } from '@/frontend/data';
import type { ResolvedFile } from '@/shared/contracts/file';

import { readPngDimensions } from '../utils/readPngDimensions';
import { FileViewerHeader } from './FileViewerHeader';

export function FileImageViewer({ file }: { file: ResolvedFile }) {
  const { t } = useTranslation();
  const [isZoomed, setIsZoomed] = useState(false);
  const [width, setWidth] = useState(0);
  const isDocument =
    file.entry.provenance === 'document-export' && file.entry.mediaType === 'image/png';
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const dimensionsQuery = useQuery({
    enabled: isDocument,
    queryKey: queryKeys.files.imageDimensions(file.entry, file.uri),
    queryFn: () => {
      const dimensions = readPngDimensions(file.uri);
      if (!dimensions) throw new Error('Invalid PNG');
      return dimensions;
    },
    networkMode: 'always',
    retry: false,
    staleTime: Infinity,
    gcTime: 60_000,
  });
  const dimensions = dimensionsQuery.data;

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !isZoomed }} />
      <FileViewerHeader file={file} />
      <View
        className="flex-1 pb-safe"
        onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
      >
        {!isDocument ? (
          <ArtifactImageViewer
            accessibilityLabel={file.entry.filename}
            onZoomChange={setIsZoomed}
            uri={file.uri}
          />
        ) : failed || dimensionsQuery.isError ? (
          <View className="flex-1 justify-center bg-background p-6">
            <ContentState.Error
              title={t('fileViewer.previewFailed')}
              primaryAction={{
                children: t('common.retry'),
                onPress: () => {
                  setFailed(false);
                  setIsZoomed(false);
                  setAttempt((value) => value + 1);
                  void dimensionsQuery.refetch();
                },
              }}
            />
          </View>
        ) : dimensions && width > 0 ? (
          <ArtifactImagePages
            key={attempt}
            images={[{ ...dimensions, uri: file.uri, label: file.entry.filename }]}
            onError={() => {
              setFailed(true);
              setIsZoomed(false);
            }}
            onZoomChange={setIsZoomed}
            width={width}
          />
        ) : (
          <View className="flex-1 justify-center bg-background p-6">
            <ContentState.Loading title={t('fileViewer.loading')} />
          </View>
        )}
      </View>
    </>
  );
}
