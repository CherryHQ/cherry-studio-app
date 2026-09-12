import { Text, View } from 'react-native';

import { Image } from '../../image';
import type { FilePreviewFile, FilePreviewOperation } from '../file-preview.types';
import { useQuickLookThumbnail } from '../hooks/use-quick-look-thumbnail.ios';
import { FallbackPreview } from './fallback-preview';

export function QuickLookPreview({
  file,
  onError,
  size,
}: {
  file: FilePreviewFile;
  onError?: (error: Error, operation: FilePreviewOperation) => void;
  size: number;
}) {
  const thumbnailDisplaySize = Math.max(1, size - 24);
  const thumbnailUri = useQuickLookThumbnail({ file, height: size, onError, width: size });

  if (!thumbnailUri) {
    return <FallbackPreview file={file} size={size} />;
  }

  return (
    <View className="flex-1 items-center justify-center border border-border bg-secondary">
      <Image
        cachePolicy="memory-disk"
        contentFit="contain"
        recyclingKey={`${file.id}:${file.revision}:${size}`}
        source={thumbnailUri}
        style={{ height: thumbnailDisplaySize, width: thumbnailDisplaySize }}
      />
      {file.extensionLabel ? (
        <View pointerEvents="none" className="absolute right-0 bottom-2 left-0 items-center px-2">
          <View className="max-w-full rounded-full border border-constant-white/10 bg-constant-black/55 px-2 py-0.5">
            <Text className="text-base text-constant-white" numberOfLines={1}>
              {file.extensionLabel}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
