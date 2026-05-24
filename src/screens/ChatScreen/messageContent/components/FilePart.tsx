import type { CherryMessagePart } from '@/data/types/message';

import { PartPlaceholder } from './PartPlaceholder';

type FilePartProps = {
  part: Extract<CherryMessagePart, { type: 'file' }>;
};

export function FilePart({ part }: FilePartProps) {
  return (
    <PartPlaceholder
      description={part.filename ?? part.mediaType}
      icon={part.mediaType.startsWith('video/') ? 'video' : 'file'}
      label="File"
    />
  );
}
