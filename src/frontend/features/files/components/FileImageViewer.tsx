import { ContentState } from '@cherrystudio/ui/components';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ArtifactImageViewer } from '@/frontend/components/ArtifactPreview';
import type { ResolvedFile } from '@/shared/contracts/file';

import { FileViewerHeader } from './FileViewerHeader';

export function FileImageViewer({ file }: { file: ResolvedFile }) {
  const { t } = useTranslation();
  const [hasError, setHasError] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !isZoomed }} />
      <FileViewerHeader file={file} />
      {hasError ? (
        <View className="flex-1 items-center justify-center bg-background p-6">
          <ContentState.Error
            description={t('fileViewer.readFailedDescription')}
            primaryAction={{ children: t('common.retry'), onPress: () => setHasError(false) }}
            title={t('fileViewer.previewFailed')}
          />
        </View>
      ) : (
        <View className="flex-1 pb-safe">
          <ArtifactImageViewer
            accessibilityLabel={file.entry.filename}
            onError={() => {
              setHasError(true);
              setIsZoomed(false);
            }}
            onZoomChange={setIsZoomed}
            uri={file.uri}
          />
        </View>
      )}
    </>
  );
}
