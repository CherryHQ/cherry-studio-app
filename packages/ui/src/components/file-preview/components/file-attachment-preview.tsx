import FileTextIcon from '@cherrystudio/app-icons/icons/file-text';
import { createElement } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { defaultFileCardThumbnail } from '../default-plugins/default-plugins';
import type { FileAttachmentPreviewProps } from '../file-preview.types';

export function FileAttachmentPreview({
  categoryLabel,
  file,
  labels,
  onError,
  onPress,
}: FileAttachmentPreviewProps) {
  const handlePress = () => {
    if (!file) return;

    onPress();
  };

  return (
    <Pressable
      accessibilityLabel={file?.displayName ?? labels.unavailable}
      accessibilityRole="button"
      accessibilityState={!file ? { disabled: true } : undefined}
      className="active:opacity-70"
      disabled={!file}
      onPress={handlePress}
      style={{ width: '100%' }}
    >
      <View
        className="h-16 w-full flex-row overflow-hidden rounded-xl border border-border bg-secondary"
        style={{ borderCurve: 'continuous' }}
      >
        <View className="w-16 shrink-0 items-center justify-center overflow-hidden">
          {file && defaultFileCardThumbnail ? (
            <View className="size-12 overflow-hidden rounded-lg">
              {createElement(defaultFileCardThumbnail, { file, onError, size: 48 })}
            </View>
          ) : (
            <View
              className="size-10 items-center justify-center rounded-lg border border-border bg-background"
              style={{ borderCurve: 'continuous', transform: [{ rotate: '-5deg' }] }}
            >
              <FileTextIcon className="size-5 text-foreground" />
            </View>
          )}
        </View>
        <View className="min-w-0 flex-1 justify-center gap-0.5 pr-3">
          <Text className="text-base text-foreground" numberOfLines={1}>
            {file ? filenameStem(file.displayName) : labels.unavailable}
          </Text>
          {file ? (
            <Text className="text-sm text-muted-foreground" numberOfLines={1}>
              {file.extensionLabel ? `${categoryLabel} · ${file.extensionLabel}` : categoryLabel}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function filenameStem(filename: string): string {
  const extensionIndex = filename.lastIndexOf('.');
  return extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
}
