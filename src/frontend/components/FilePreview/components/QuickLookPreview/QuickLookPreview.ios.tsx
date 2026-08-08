import type { FileEntry } from '@cherrystudio/universal/data/types/file';
import { Text, View } from 'react-native';

import { Image } from '@/frontend/components/nativePrimitives';

import { fileEntryExtensionLabel } from '../../utils/fileEntryPresentation';
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
  const extension = fileEntryExtensionLabel(entry);
  const thumbnailDisplaySize = Math.max(1, size - 24);
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
        style={{ height: thumbnailDisplaySize, width: thumbnailDisplaySize }}
      />
      {extension ? (
        <View pointerEvents="none" className="absolute right-0 bottom-2 left-0 items-center px-2">
          <View className="max-w-full rounded-full border border-constant-white/10 bg-constant-black/55 px-2 py-0.5">
            <Text className="text-base text-constant-white" numberOfLines={1}>
              {extension}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
