import type { CherryMessagePart } from '@/shared/data/types/message';

import { omitGeneratedImageReferences } from './parts/omitGeneratedImageReferences';
import { partitionMessageParts } from './parts/partitionMessageParts';

/** Use the same normalized answer body as the message renderer, retaining part indices. */
export function selectAssistantBodyTextParts(parts: readonly CherryMessagePart[]) {
  const normalizedParts = omitGeneratedImageReferences(parts);
  const { body } = partitionMessageParts(normalizedParts);
  const bodyTextParts = body.flatMap(({ index, part }) =>
    part.type === 'text' ? [{ index, part }] : [],
  );
  return { parts: normalizedParts, bodyTextParts };
}
