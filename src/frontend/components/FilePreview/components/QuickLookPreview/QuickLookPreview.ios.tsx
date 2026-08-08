import type { FileEntry } from '@cherrystudio/universal/data/types/file';
import { Text, View } from 'react-native';

import { Image } from '@/frontend/components/nativePrimitives';

import { fileEntryDisplayName } from '../../utils/fileEntryPresentation';
import { FallbackPreview } from '../FallbackPreview/FallbackPreview';
import { useQuickLookThumbnail } from './useQuickLookThumbnail.ios';

const filenameHeight = 60;

export function QuickLookPreview({
  entry,
  size,
  uri,
}: {
  entry: FileEntry;
  size: number;
  uri: string;
}) {
  const showFilename = size >= 96;
  const thumbnailHeight = Math.max(1, size - (showFilename ? filenameHeight : 0));
  const thumbnailUri = useQuickLookThumbnail({ entry, height: thumbnailHeight, uri, width: size });

  if (!thumbnailUri) {
    return <FallbackPreview entry={entry} size={size} />;
  }

  return (
    <View className="flex-1 border border-border bg-secondary">
      <Image
        cachePolicy="memory-disk"
        contentFit="contain"
        recyclingKey={`${entry.id}:${entry.updatedAt}:${size}`}
        source={thumbnailUri}
        style={{ height: thumbnailHeight, width: size }}
      />
      {showFilename ? (
        <View className="h-[60px] justify-center border-border border-t px-2">
          <Text className="text-base text-foreground" numberOfLines={2}>
            {fileEntryDisplayName(entry)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
