import { FileTile, ImageTile } from '@/components/mediaTile';
import type { CherryMessagePart } from '@/data/types/message';

type FilePartProps = {
  part: Extract<CherryMessagePart, { type: 'file' }>;
};

export function FilePart({ part }: FilePartProps) {
  if (part.mediaType.startsWith('image/')) {
    return <ImageTile accessibilityLabel={part.filename ?? 'Image'} uri={part.url} />;
  }

  return <FileTile name={part.filename ?? part.mediaType} />;
}
