import type { CherryMessagePart } from '@/data/types/message';

import { PartMarkdown } from './PartMarkdown';

type ReasoningPartProps = {
  part: Extract<CherryMessagePart, { type: 'reasoning' }>;
};

export function ReasoningPart({ part }: ReasoningPartProps) {
  return <PartMarkdown markdown={part.text} />;
}
