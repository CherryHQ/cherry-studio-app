import type { CherryMessagePart } from '@/shared/data/types/message';
import { createCodeBlockMarkdown } from '@/shared/utils/createCodeBlockMarkdown';

import { PartMarkdown } from './PartMarkdown';

type CodePartProps = {
  isStreaming: boolean;
  part: Extract<CherryMessagePart, { type: 'data-code' }>;
};

export function CodePart({ isStreaming, part }: CodePartProps) {
  return (
    <PartMarkdown
      isStreaming={isStreaming}
      markdown={createCodeBlockMarkdown(part.data.content, part.data.language)}
    />
  );
}
