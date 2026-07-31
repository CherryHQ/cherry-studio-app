import type { CherryMessagePart } from '@/shared/data/types/message';

import { PartMarkdown } from './PartMarkdown';

type CodePartProps = {
  isStreaming: boolean;
  part: Extract<CherryMessagePart, { type: 'data-code' }>;
};

export function CodePart({ isStreaming, part }: CodePartProps) {
  return (
    <PartMarkdown
      isStreaming={isStreaming}
      markdown={`\`\`\`${part.data.language}\n${part.data.content}\n\`\`\``}
    />
  );
}
