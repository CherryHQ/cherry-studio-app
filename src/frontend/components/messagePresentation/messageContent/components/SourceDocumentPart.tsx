import { MessagePart } from '@cherrystudio/ui/components';
import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';

type SourceDocumentPartProps = {
  part: Extract<CherryMessagePart, { type: 'source-document' }>;
};

export function SourceDocumentPart({ part }: SourceDocumentPartProps) {
  return <MessagePart.Placeholder label={part.title} />;
}
