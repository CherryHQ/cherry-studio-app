import type { CherryMessagePart } from '@/data/types/message';

import { PartMarkdown } from './PartMarkdown';

type CompactPartProps = {
  part: Extract<CherryMessagePart, { type: 'data-compact' }>;
};

export function CompactPart({ part }: CompactPartProps) {
  return <PartMarkdown markdown={part.data.content} />;
}
