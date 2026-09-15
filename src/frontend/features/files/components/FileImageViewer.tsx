import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ArtifactImageViewer } from '@/frontend/components/ArtifactPreview';
import type { ResolvedFile } from '@/shared/contracts/file';

import { FileViewerHeader } from './FileViewerHeader';

export function FileImageViewer({ file }: { file: ResolvedFile }) {
  const [isZoomed, setIsZoomed] = useState(false);

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !isZoomed }} />
      <FileViewerHeader file={file} />
      <View className="flex-1 pb-safe">
        <ArtifactImageViewer
          accessibilityLabel={file.entry.filename}
          onZoomChange={setIsZoomed}
          uri={file.uri}
        />
      </View>
    </>
  );
}
