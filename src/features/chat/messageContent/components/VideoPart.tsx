import type { CherryMessagePart } from '@/data/types/message';

import { PartPlaceholder } from './PartPlaceholder';

type VideoPartProps = {
  part: Extract<CherryMessagePart, { type: 'data-video' }>;
};

export function VideoPart({ part }: VideoPartProps) {
  return (
    <PartPlaceholder
      description={part.data.url ?? part.data.filePath ?? 'Video attachment'}
      icon="video"
      label="Video"
    />
  );
}
