import { Image } from '../../image';
import type { FilePreviewFile } from '../file-preview.types';

export function ImagePreview({ file }: { file: FilePreviewFile }) {
  return (
    <Image
      cachePolicy="memory-disk"
      className="absolute inset-0 bg-secondary"
      contentFit="cover"
      recyclingKey={`${file.id}:${file.revision}`}
      source={file.previewUri ?? file.uri}
    />
  );
}
