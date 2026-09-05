import { createElement } from 'react';

import type { FilePreviewProps } from '../file-preview.types';
import { useFilePreviewPlugins } from '../hooks/use-file-preview-plugins';
import { FilePreviewUnavailable } from './fallback-preview';
import { FilePreviewFrame } from './file-preview-frame';

const defaultSize = 112;

export function FilePreview({
  file,
  labels,
  onError,
  onPress,
  size = defaultSize,
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
    >
      {file && Preview ? (
        createElement(Preview, { file, onError, size: resolvedSize })
      ) : (
        <FilePreviewUnavailable label={labels.unavailable} size={resolvedSize} />
      )}
    </FilePreviewFrame>
  );
}
