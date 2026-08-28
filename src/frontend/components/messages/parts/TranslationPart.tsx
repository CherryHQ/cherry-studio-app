import { MessagePart } from '@cherrystudio/ui/components';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { PartMarkdown } from './PartMarkdown';

type TranslationPartProps = {
  isStreaming: boolean;
  isTextSelectionEnabled: boolean;
  part: Extract<CherryMessagePart, { type: 'data-translation' }>;
};

export function TranslationPart({
  isStreaming,
  isTextSelectionEnabled,
  part,
}: TranslationPartProps) {
  return (
    <MessagePart.Translation>
      <PartMarkdown
        isStreaming={isStreaming}
        markdown={part.data.content}
        selectable={isTextSelectionEnabled}
      />
    </MessagePart.Translation>
  );
}
