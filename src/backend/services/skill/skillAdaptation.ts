import { SkillsError, type SkillTextChange } from '@/shared/contracts/skills';

import { type SkillPackageFiles, validateSkillPackage } from './skillPackage';

/** Preserve the frontmatter bytes, line endings and every untouched package file. */
export function adaptSkillPackage(
  files: SkillPackageFiles,
  name: string,
  changes: readonly SkillTextChange[],
) {
  const bytes = files.get('SKILL.md');
  let text: string | null = null;
  try {
    if (bytes) text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    /* Invalid UTF-8 is rejected below. */
  }
  const header = text?.match(
    /^\uFEFF?[^\S\r\n]*---[^\S\r\n]*\r?\n[\s\S]*?\r?\n[^\S\r\n]*---[^\S\r\n]*(?:\r?\n|$)/,
  );
  if (text === null || !header || !changes.length || changes.length > 3)
    throw new SkillsError(
      'package-invalid',
      'Provide up to three changes to the instruction body.',
    );
  const body = text.slice(header[0].length);
  // Instruction readers normalize CRLF. Match that representation while mapping
  // edits back to original offsets, so untouched bytes and mixed line endings survive.
  let normalized = '';
  const offsets = [0];
  for (let index = 0; index < body.length; index++) {
    if (body[index] === '\r' && body[index + 1] === '\n') {
      normalized += '\n';
      index++;
    } else normalized += body[index];
    offsets.push(index + 1);
  }
  const ranges = changes
    .map(({ before, after, reason }) => {
      const passage = before.replaceAll('\r\n', '\n');
      const start = normalized.indexOf(passage);
      if (
        !before.trim() ||
        !reason.trim() ||
        passage === after.replaceAll('\r\n', '\n') ||
        before.length > 4000 ||
        after.length > 4000 ||
        reason.length > 300 ||
        start < 0 ||
        normalized.indexOf(passage, start + 1) !== -1
      )
        throw new SkillsError(
          'package-invalid',
          'Each change must match one exact, unique body passage.',
        );
      const rawStart = offsets[start]!;
      const rawEnd = offsets[start + passage.length]!;
      return {
        start: rawStart,
        end: rawEnd,
        after: body.slice(rawStart, rawEnd).includes('\r\n')
          ? after.replace(/\r?\n/g, '\r\n')
          : after,
      };
    })
    .sort((a, b) => a.start - b.start);
  if (ranges.some((range, index) => index > 0 && range.start < ranges[index - 1]!.end))
    throw new SkillsError('package-invalid', 'Changes must not overlap.');
  if (ranges.reduce((size, range) => size + range.end - range.start, 0) > body.length / 3)
    throw new SkillsError(
      'package-invalid',
      'Adaptation must preserve at least two thirds of the instruction body.',
    );
  let adapted = body;
  for (const range of ranges.toReversed())
    adapted = adapted.slice(0, range.start) + range.after + adapted.slice(range.end);
  const result = new Map(files);
  result.set('SKILL.md', new TextEncoder().encode(header[0] + adapted));
  const validation = validateSkillPackage(result, { expectedName: name });
  if (!validation.ok || !adapted.trim())
    throw new SkillsError('package-invalid', 'The adapted Skill package failed validation.');
  return { files: result, package: validation.package };
}
