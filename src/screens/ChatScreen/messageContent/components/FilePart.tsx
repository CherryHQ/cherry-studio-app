import type { CherryMessagePart } from '@/data/types/message';
import { FileTile, ImageTile } from '../../mediaTile';

type FilePartProps = {
  part: Extract<CherryMessagePart, { type: 'file' }>;
};

export function FilePart({ part }: FilePartProps) {
  if (part.mediaType.startsWith('image/')) {
    return <ImageTile accessibilityLabel={part.filename ?? 'Image'} uri={part.url} />;
  }

  return <FileTile name={part.filename ?? part.mediaType} />;
}
