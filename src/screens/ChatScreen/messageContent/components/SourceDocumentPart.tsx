import type { CherryMessagePart } from '@/data/types/message';

import { PartPlaceholder } from './PartPlaceholder';

type SourceDocumentPartProps = {
  part: Extract<CherryMessagePart, { type: 'source-document' }>;
};

export function SourceDocumentPart({ part }: SourceDocumentPartProps) {
  return (
    <PartPlaceholder
      description={part.filename ?? part.mediaType}
      icon="document"
      label={part.title}
    />
  );
}
