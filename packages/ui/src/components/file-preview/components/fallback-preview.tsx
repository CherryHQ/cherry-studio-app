import { Text, View } from 'react-native';

import type { FilePreviewFile } from '../file-preview.types';

export function FallbackPreview({ file, size }: { file: FilePreviewFile; size: number }) {
  const showFilename = size >= 96;

  return (
    <View className="flex-1 items-start justify-between border border-border bg-secondary p-2">
      {file.extensionLabel ? (
        <View className="max-w-full rounded-md border border-border px-1.5 py-0.5">
          <Text className="font-semibold text-base text-foreground" numberOfLines={1}>
            {file.extensionLabel}
          </Text>
        </View>
      ) : (
        <View />
      )}
      {showFilename ? (
        <Text className="text-base text-foreground" numberOfLines={2}>
          {file.displayName}
        </Text>
      ) : null}
    </View>
  );
}

export function FilePreviewUnavailable({ label, size }: { label: string; size: number }) {
  return (
    <View className="flex-1 items-center justify-center border border-border bg-secondary p-2 opacity-60">
      {size >= 96 ? (
        <Text className="text-base text-muted-foreground" numberOfLines={2}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}
