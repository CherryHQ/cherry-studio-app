import type { CherryMessagePart } from '@/data/types/message';

import { PartMarkdown } from './PartMarkdown';

type CompactPartProps = {
  isStreaming: boolean;
  part: Extract<CherryMessagePart, { type: 'data-compact' }>;
};

export function CompactPart({ isStreaming, part }: CompactPartProps) {
  return <PartMarkdown isStreaming={isStreaming} markdown={part.data.content} />;
}
