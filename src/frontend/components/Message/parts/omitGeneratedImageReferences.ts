import MarkdownIt from 'markdown-it';

import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

const parser = new MarkdownIt({ html: false, linkify: false });

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
  const ids = [...imageIds];

  let changed = false;
  const result = parts.map((part) => {
    if (part.type !== 'text' || !part.text.includes('![')) return part;
    if (!ids.some((id) => part.text.includes(id))) return part;

    const tokens = parser.parse(part.text, {});
    const lines = part.text.split('\n');
    const omittedLines = new Set<number>();
    for (const [index, token] of tokens.entries()) {
      // Only standalone images: keep code examples, nested blocks, and surrounding prose intact.
      if (
        token.type !== 'inline' ||
        token.level !== 1 ||
        tokens[index - 1]?.type !== 'paragraph_open' ||
        token.children?.length !== 1 ||
        !token.map
      )
        continue;
      const image = token.children[0];
      if (image.type !== 'image') continue;
      const source = image.attrGet('src');
      if (typeof source !== 'string') continue;
      // Models sometimes invent a preview URL from an opaque file id. Match only
      // the complete final path segment of an image already owned by this message.
      const id = source.split(/[?#]/, 1)[0]?.split('/').pop();
      if (!id || !imageIds.has(id)) continue;
      let [start, end] = token.map;
      while (end < lines.length && !lines[end].trim()) end += 1;
      for (; start < end; start += 1) omittedLines.add(start);
    }
    if (!omittedLines.size) return part;
    changed = true;
    return { ...part, text: lines.filter((_, index) => !omittedLines.has(index)).join('\n') };
  });
  return changed ? result : parts;
}
