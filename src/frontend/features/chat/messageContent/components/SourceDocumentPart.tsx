import type { CherryMessagePart } from '@/shared/domain/message';

import { PartPlaceholder } from './PartPlaceholder';

type SourceDocumentPartProps = {
  part: Extract<CherryMessagePart, { type: 'source-document' }>;
};

export function SourceDocumentPart({ part }: SourceDocumentPartProps) {
  return <PartPlaceholder icon="document" label={part.title} />;
}
