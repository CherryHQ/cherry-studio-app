import { omitGeneratedImageReferencesFromMarkdown } from '@/frontend/utils/omitGeneratedImageReferences';
import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

/** Presentation only: generated files already render as images outside the Markdown body. */
export function omitGeneratedImageReferences(
  parts: readonly CherryMessagePart[],
): readonly CherryMessagePart[] {
  const imageIds = new Set<string>();
  for (const part of parts) {
    if (part.type !== 'file' || !part.mediaType.toLowerCase().startsWith('image/')) continue;
    const id = readCherryMeta(part)?.fileEntryId;
    if (id) imageIds.add(id);
  }
  if (!imageIds.size) return parts;

  let changed = false;
  const result = parts.map((part) => {
    if (part.type !== 'text') return part;
    const text = omitGeneratedImageReferencesFromMarkdown(part.text, imageIds);
    if (text === part.text) return part;
    changed = true;
    return { ...part, text };
  });
  return changed ? result : parts;
}
