import type { CherryMessagePart } from '@/data/types/message';

import { PartPlaceholder } from './PartPlaceholder';

type SourceUrlPartProps = {
  part: Extract<CherryMessagePart, { type: 'source-url' }>;
};

export function SourceUrlPart({ part }: SourceUrlPartProps) {
  return <PartPlaceholder description={part.url} icon="link" label={part.title ?? 'Source'} />;
}
