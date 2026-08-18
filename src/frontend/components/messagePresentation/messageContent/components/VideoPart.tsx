import { MessagePart } from '@cherrystudio/ui/components';
import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';

type VideoPartProps = {
  part: Extract<CherryMessagePart, { type: 'data-video' }>;
};

export function VideoPart({ part }: VideoPartProps) {
  return (
    <MessagePart.Placeholder
      description={part.data.url ?? part.data.filePath ?? 'Video attachment'}
      label="Video"
    />
  );
}
