import type { FilePreviewProps } from '../file-preview.types';
import { useFilePreviewPlugins } from '../hooks/use-file-preview-plugins';
import { openFilePreview } from '../utils/open-file/open-file';
import { FilePreviewUnavailable } from './fallback-preview';
import { FilePreviewFrame } from './file-preview-frame';

const defaultSize = 112;

export function FilePreview({ file, labels, onError, size = defaultSize }: FilePreviewProps) {
  const resolvedSize = Math.max(1, size);
  const { resolve } = useFilePreviewPlugins();
  const handlePress = () => {
    if (!file) {
      return;
    }
    void openFilePreview({ file, labels }).catch((error) => {
      onError?.(toError(error), 'open');
    });
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
        <Preview file={file} onError={onError} size={resolvedSize} />
      ) : (
        <FilePreviewUnavailable label={labels.unavailable} size={resolvedSize} />
      )}
    </FilePreviewFrame>
  );
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
