import { MessagePart } from '@cherrystudio/ui/components';
import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';

import { PartMarkdown } from './PartMarkdown';

type TranslationPartProps = {
  isStreaming: boolean;
  part: Extract<CherryMessagePart, { type: 'data-translation' }>;
};

export function TranslationPart({ isStreaming, part }: TranslationPartProps) {
  return (
    <MessagePart.Translation>
      <PartMarkdown isStreaming={isStreaming} markdown={part.data.content} />
    </MessagePart.Translation>
  );
}
