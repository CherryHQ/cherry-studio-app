import { Image } from '@cherrystudio/ui/components';
import type { FileEntry } from '@cherrystudio/universal/data/types/file';

type ImagePreviewProps = {
  entry: FileEntry;
  uri: string;
};

export function ImagePreview({ entry, uri }: ImagePreviewProps) {
  return (
    <Image
      cachePolicy="memory-disk"
      className="absolute inset-0 bg-secondary"
      contentFit="cover"
      recyclingKey={`${entry.id}:${entry.updatedAt}`}
      source={uri}
    />
  );
}
