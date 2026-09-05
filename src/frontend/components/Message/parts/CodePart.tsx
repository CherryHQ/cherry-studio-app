import { createCodeBlockMarkdown } from '@/frontend/utils/createCodeBlockMarkdown';
import type { CherryMessagePart } from '@/shared/data/types/message';

import { PartMarkdown } from './PartMarkdown';

type CodePartProps = {
  isStreaming: boolean;
  isTextSelectionEnabled: boolean;
  part: Extract<CherryMessagePart, { type: 'data-code' }>;
};

export function CodePart({ isStreaming, isTextSelectionEnabled, part }: CodePartProps) {
  return (
    <PartMarkdown
      isStreaming={isStreaming}
      markdown={createCodeBlockMarkdown(part.data.content, part.data.language)}
      selectable={isTextSelectionEnabled}
    />
  );
}
