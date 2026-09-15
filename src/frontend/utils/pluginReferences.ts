import { PluginTextReferenceSchema, type PluginTextReference } from '@/shared/data/types/plugin';

export type PluginTextSegment = { text: string; reference?: PluginTextReference };

/** Unknown or stale metadata leaves the original prose untouched. */
export function splitPluginReferences(
  text: string,
  references: readonly unknown[] = [],
): PluginTextSegment[] {
  const segments: PluginTextSegment[] = [];
  let cursor = 0;
  for (const value of references) {
    const parsed = PluginTextReferenceSchema.safeParse(value);
    if (!parsed.success) continue;
    const reference = parsed.data;
    const end = reference.offset + reference.label.length;
    if (reference.offset < cursor || text.slice(reference.offset, end) !== reference.label)
      continue;
    if (reference.offset > cursor) segments.push({ text: text.slice(cursor, reference.offset) });
    segments.push({ text: reference.label, reference });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
