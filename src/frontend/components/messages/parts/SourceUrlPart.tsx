import type { CherryMessagePart } from '@/shared/data/types/message';

import { SourceLink } from './SourceLink';

type SourceUrlPartProps = {
  part: Extract<CherryMessagePart, { type: 'source-url' }>;
};

export function SourceUrlPart({ part }: SourceUrlPartProps) {
  return <SourceLink label={part.title ?? part.url} url={part.url} />;
}
