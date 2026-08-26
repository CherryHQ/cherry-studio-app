import ExpoQuickLook from '@magrinj/expo-quick-look';

import type { FilePreviewProps } from '../../file-preview.types';
import { FallbackPreview, FilePreviewUnavailable } from '../fallback-preview';
import { FilePreviewFrame } from '../file-preview-frame';
import { ImagePreview } from '../image-preview';

const defaultSize = 112;

export function FilePreview({ file, labels, onError, size = defaultSize }: FilePreviewProps) {
  const resolvedSize = Math.max(1, size);
  const handlePress = () => {
    if (!file) {
      return;
    }
    void ExpoQuickLook.previewFile({ chooserTitle: labels.openWith, uri: file.uri }).catch(
      (error) => {
        onError?.(toError(error), 'open');
      },
    );
  };

  return (
    <FilePreviewFrame
      accessibilityLabel={file?.displayName ?? labels.unavailable}
      disabled={!file}
      onPress={handlePress}
      size={resolvedSize}
    >
      {!file ? (
        <FilePreviewUnavailable label={labels.unavailable} size={resolvedSize} />
      ) : file.kind === 'image' ? (
        <ImagePreview file={file} />
      ) : (
        <FallbackPreview file={file} size={resolvedSize} />
      )}
    </FilePreviewFrame>
  );
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
