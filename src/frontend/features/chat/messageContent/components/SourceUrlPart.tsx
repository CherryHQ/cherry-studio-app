import type { CherryMessagePart } from '@cherrystudio/shared/data/types/message';

import { SourceUrlItem } from './SourceUrlItem';

type SourceUrlPartProps = {
  part: Extract<CherryMessagePart, { type: 'source-url' }>;
};

export function SourceUrlPart({ part }: SourceUrlPartProps) {
  return <SourceUrlItem label={part.title ?? part.url} url={part.url} />;
}
