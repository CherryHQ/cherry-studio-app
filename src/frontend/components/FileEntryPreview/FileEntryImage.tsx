import { Image } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { queryKeys, useBackendModule } from '@/frontend/data';
import type { ResolvedFile } from '@/shared/contracts/file';

import { useOpenFileEntry } from './hooks/useOpenFileEntry';

/** A generated image is the deliverable, so its whole surface is visible in chat. */
export function FileEntryImage({ entry, uri }: ResolvedFile) {
  const { t } = useTranslation();
  const file = useBackendModule('file');
  const { openFileEntry } = useOpenFileEntry();
  const [aspectRatio, setAspectRatio] = useState(1);
  const [hasError, setHasError] = useState(false);
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
        {hasError ? (
          <View className="flex-1 items-center justify-center gap-2 p-4">
            <Text className="text-base text-foreground">{entry.filename}</Text>
            <Text className="text-sm text-muted-foreground">{t('fileViewer.previewFailed')}</Text>
          </View>
        ) : (
          <Image
            accessible={false}
            className="size-full"
            contentFit="contain"
            onError={() => setHasError(true)}
            onLoad={({ source }) => {
              if (source.width > 0 && source.height > 0) {
                setAspectRatio(Math.max(source.width / source.height, 0.8));
              }
            }}
            source={preview.data?.previewUri ?? (preview.isPending ? undefined : uri)}
          />
        )}
      </View>
    </Pressable>
  );
}
