import type { FileEntry } from '@cherrystudio/universal/data/types/file';
import { Text, View } from 'react-native';

import { fileEntryDisplayName, fileEntryExtensionLabel } from '../../utils/fileEntryPresentation';

type FallbackPreviewProps = {
  entry: FileEntry;
  size: number;
};

export function FallbackPreview({ entry, size }: FallbackPreviewProps) {
  const extension = fileEntryExtensionLabel(entry);
  const showFilename = size >= 96;

  return (
    <View className="flex-1 items-start justify-between border border-border bg-secondary p-2">
      {extension ? (
        <View className="max-w-full rounded-md border border-border px-1.5 py-0.5">
          <Text className="font-semibold text-base text-foreground" numberOfLines={1}>
            {extension}
          </Text>
        </View>
      ) : (
        <View />
      )}
      {showFilename ? (
        <Text className="text-base text-foreground" numberOfLines={2}>
          {fileEntryDisplayName(entry)}
        </Text>
      ) : null}
    </View>
  );
}
