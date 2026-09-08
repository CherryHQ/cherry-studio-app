import { createElement } from 'react';
import { View } from 'react-native';

import type { FilePreviewProps } from '../file-preview.types';
import { useFilePreviewPlugins } from '../hooks/use-file-preview-plugins';
import { FilePreviewUnavailable } from './fallback-preview';
import { FileCardPreview } from './file-card-preview';
import { FilePreviewFrame } from './file-preview-frame';

const defaultSize = 112;

export function FilePreview({
  badge,
  file,
  labels,
  onError,
  onPress,
  size = defaultSize,
  variant = 'thumbnail',
}: FilePreviewProps) {
  const resolvedSize = Math.max(1, size);
  const { resolve } = useFilePreviewPlugins();
  const handlePress = () => {
    if (!file) {
      return;
    }
    onPress();
  };
  const Preview = file ? resolve(file.kind) : undefined;

  return (
    <FilePreviewFrame
      accessibilityLabel={file?.displayName ?? labels.unavailable}
      disabled={!file}
      onPress={handlePress}
      size={resolvedSize}
      variant={variant}
    >
      {file && Preview ? (
        variant !== 'thumbnail' && file.kind !== 'image' ? (
          <FileCardPreview badge={badge} file={file} variant={variant} />
        ) : (
          <>
            {createElement(Preview, { file, onError, size: resolvedSize })}
            {badge ? (
              <View className="absolute right-3 bottom-3 max-w-3/4" pointerEvents="none">
                {badge}
              </View>
            ) : null}
          </>
        )
      ) : (
        <FilePreviewUnavailable label={labels.unavailable} size={resolvedSize} />
      )}
    </FilePreviewFrame>
  );
}
