import type { CherryMessagePart } from '@/data/types/message';

import { PartMarkdown } from './PartMarkdown';

type CodePartProps = {
  part: Extract<CherryMessagePart, { type: 'data-code' }>;
};

export function CodePart({ part }: CodePartProps) {
  return <PartMarkdown markdown={`\`\`\`${part.data.language}\n${part.data.content}\n\`\`\``} />;
}
