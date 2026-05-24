import type { CherryMessagePart } from '@/data/types/message';

import { PartMarkdown } from './PartMarkdown';

type TranslationPartProps = {
  part: Extract<CherryMessagePart, { type: 'data-translation' }>;
};

export function TranslationPart({ part }: TranslationPartProps) {
  return <PartMarkdown markdown={part.data.content} />;
}
