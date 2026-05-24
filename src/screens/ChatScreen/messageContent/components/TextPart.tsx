import type { CherryMessagePart } from '@/data/types/message';

import { PartMarkdown } from './PartMarkdown';

type TextPartProps = {
  part: Extract<CherryMessagePart, { type: 'text' }>;
};

export function TextPart({ part }: TextPartProps) {
  return <PartMarkdown markdown={part.text} />;
}
