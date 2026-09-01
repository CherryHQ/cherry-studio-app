import type { CherryMessagePart } from '@/shared/data/types/message';

import { parseWebSources } from './webSource';
import { WebSourceCard } from './WebSourceCard';

type SourceUrlPartProps = {
  part: Extract<CherryMessagePart, { type: 'source-url' }>;
};

export function SourceUrlPart({ part }: SourceUrlPartProps) {
  const source = parseWebSources(part)[0];
  return source ? <WebSourceCard source={source} /> : null;
}
