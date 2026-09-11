import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { queryKeys, useBackendModule } from '@/frontend/data';
import type { ResolvedFile } from '@/shared/contracts/file';

import { useOpenFileEntry } from './hooks/useOpenFileEntry';
import { PreviewImage } from './PreviewImage';

/** A generated image is the deliverable, so its whole surface is visible in chat. */
export function FileEntryImage({ entry, uri }: ResolvedFile) {
  const file = useBackendModule('file');
  const { openFileEntry } = useOpenFileEntry();
  const [aspectRatio, setAspectRatio] = useState(1);
  const preview = useQuery({
    networkMode: 'always',
    queryFn: async () => ({ entry, uri, previewUri: await file.generatePreviewUri(entry) }),
    queryKey: queryKeys.files.previewUri(entry),
    retry: false,
    staleTime: Infinity,
  });

  return (
    <Pressable
      accessibilityLabel={entry.filename}
      accessibilityRole="button"
      onPress={() => openFileEntry({ entry, uri })}
    >
      <View className="w-full overflow-hidden rounded-xl bg-secondary" style={{ aspectRatio }}>
        <PreviewImage
          key={preview.data?.previewUri ?? uri}
          label={entry.filename}
          accessible={false}
          className="size-full"
          contentFit="contain"
          onLoad={({ source }) => {
            if (source.width > 0 && source.height > 0) {
              setAspectRatio(Math.max(source.width / source.height, 0.8));
            }
          }}
          source={preview.data?.previewUri ?? (preview.isPending ? undefined : uri)}
        />
      </View>
    </Pressable>
  );
}
