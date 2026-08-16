import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';

import { PartPlaceholder } from './PartPlaceholder';

type SourceDocumentPartProps = {
  part: Extract<CherryMessagePart, { type: 'source-document' }>;
};

export function SourceDocumentPart({ part }: SourceDocumentPartProps) {
  return <PartPlaceholder label={part.title} />;
}
