import type { FileEntry } from '@cherrystudio/universal/data/types/file';
import { Text, View } from 'react-native';

import { Image } from '@/frontend/components/nativePrimitives';

import { fileEntryDisplayName } from '../../utils/fileEntryPresentation';
import { FallbackPreview } from '../FallbackPreview/FallbackPreview';
import { useQuickLookThumbnail } from './useQuickLookThumbnail.ios';

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
  const thumbnailUri = useQuickLookThumbnail({ entry, height: size, uri, width: size });

  if (!thumbnailUri) {
    return <FallbackPreview entry={entry} size={size} />;
  }

  return (
    <View className="flex-1 items-center justify-center border border-border bg-secondary">
      <Image
        cachePolicy="memory-disk"
        contentFit="contain"
        recyclingKey={`${entry.id}:${entry.updatedAt}:${size}`}
        source={thumbnailUri}
        style={{ height: size, width: size }}
      />
      {showFilename ? (
        <View className="absolute right-0 bottom-0 left-0 justify-center bg-constant-black/65 px-2 py-1.5">
          <Text className="text-base text-constant-white" numberOfLines={2}>
            {fileEntryDisplayName(entry)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
