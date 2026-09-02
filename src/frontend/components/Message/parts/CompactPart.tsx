import type { CherryMessagePart } from '@/shared/data/types/message';

import { PartMarkdown } from './PartMarkdown';

type CompactPartProps = {
  isStreaming: boolean;
  isTextSelectionEnabled: boolean;
  part: Extract<CherryMessagePart, { type: 'data-compact' }>;
};

export function CompactPart({ isStreaming, isTextSelectionEnabled, part }: CompactPartProps) {
  return (
    <PartMarkdown
      isStreaming={isStreaming}
      markdown={part.data.content}
      selectable={isTextSelectionEnabled}
    />
  );
}
