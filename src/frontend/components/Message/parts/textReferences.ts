import { PluginTextReferenceSchema, type PluginTextReference } from '@/shared/data/types/plugin';
import {
  SkillActivationSchema,
  SkillTextReferenceSchema,
  type SkillTextReference,
} from '@/shared/data/types/skill';

type TextReference = PluginTextReference | SkillTextReference;
type TextSegment = { text: string; reference?: TextReference };
const WORD_CHARACTER_PATTERN = /[\p{L}\p{N}_-]/u;

/** Decorate recorded occurrences without interpreting the user's prose as Markdown. */
export function splitTextReferences(text: string, values: readonly unknown[] = []): TextSegment[] {
  const references: TextReference[] = [];
  for (const value of values) {
    const parsed = PluginTextReferenceSchema.safeParse(value);
    if (parsed.success) references.push(parsed.data);
    else {
      const skill = SkillTextReferenceSchema.safeParse(value);
      if (skill.success) references.push(skill.data);
    }
  }

  // Older messages stored a selection receipt but no display range. Recover
  // its first standalone name without replacing a plugin or a recorded range.
  for (const value of values) {
    if (!value || typeof value !== 'object' || !('type' in value) || value.type !== 'skill')
      continue;
    const { type: _type, ...receipt } = value;
    const parsed = SkillActivationSchema.safeParse(receipt);
    if (!parsed.success) continue;
    const { skillId, name } = parsed.data;
    if (references.some((reference) => reference.type === 'skill' && reference.skillId === skillId))
      continue;
    let offset = text.indexOf(name);
    while (offset >= 0) {
      const end = offset + name.length;
      const overlaps = references.some(
        (reference) => reference.offset < end && reference.offset + reference.label.length > offset,
      );
      if (
        !WORD_CHARACTER_PATTERN.test(text[offset - 1] ?? '') &&
        !WORD_CHARACTER_PATTERN.test(text[end] ?? '') &&
        !overlaps
      ) {
        references.push({ type: 'skill', skillId, label: name, offset });
        break;
      }
      offset = text.indexOf(name, end);
    }
  }

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const reference of references.sort((left, right) => left.offset - right.offset)) {
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
