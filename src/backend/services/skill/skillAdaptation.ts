import { SkillsError } from '@/shared/contracts/skills';
import { SkillProfileSchema, type SkillProfile } from '@/shared/data/types/skill';

import type { SkillAi } from './skillAi';
import {
  assessSkillPackage,
  readAssessmentFiles,
  skillAssessmentCapabilities,
} from './skillAssessment';
import {
  decodeUtf8,
  type SkillPackageFiles,
  type ValidatedSkillPackage,
  validateSkillPackage,
} from './skillPackage';

/** Exact, bounded text replacements retain the original package and cannot introduce executable files. */
export function applySkillAdaptation(
  files: SkillPackageFiles,
  original: ValidatedSkillPackage,
  adaptation: NonNullable<SkillProfile['adaptation']>,
) {
  if (adaptation.upstreamDigest !== original.packageDigest)
    throw new SkillsError(
      'package-invalid',
      'The adaptation belongs to another upstream revision.',
    );
  const adapted = new Map(files);
  const encoder = new TextEncoder();
  for (const change of adaptation.changes) {
    if (
      !/\.(md|txt)$/i.test(change.path) ||
      /(^|\/)(scripts|assets)\//i.test(change.path) ||
      /(^|\/)(license|licence|copying|notice)(\.|$)/i.test(change.path) ||
      !adapted.has(change.path)
    )
      throw new SkillsError('package-invalid', 'Only existing instruction text can be adapted.');
    const text = decodeUtf8(adapted.get(change.path)!);
    if (
      text === null ||
      text.indexOf(change.before) < 0 ||
      text.indexOf(change.before) !== text.lastIndexOf(change.before)
    )
      throw new SkillsError(
        'package-invalid',
        'The adaptation does not identify one exact original passage.',
      );
    adapted.set(change.path, encoder.encode(text.replace(change.before, () => change.after)));
  }
  const validation = validateSkillPackage(adapted, { expectedName: original.name });
  if (
    !validation.ok ||
    JSON.stringify(validation.package.frontmatter) !== JSON.stringify(original.frontmatter)
  )
    throw new SkillsError(
      'package-invalid',
      'Adaptation cannot change identity, metadata, invocation policy or package validity.',
    );
  readAssessmentFiles(adapted);
  return { files: adapted, package: validation.package };
}

export async function adaptSkillPackage(
  ai: SkillAi,
  pkg: ValidatedSkillPackage,
  files: SkillPackageFiles,
  pluginCatalog: ReadonlyMap<string, ReadonlySet<string>>,
  signal?: AbortSignal,
) {
  if (!ai.adapt || !ai.reviewAdaptation) return null;
  const original = readAssessmentFiles(files);
  const capabilities = skillAssessmentCapabilities(pluginCatalog);
  const proposed = await ai.adapt({ files: original, capabilities }, signal);
  if (!proposed) return null;
  const adaptation = SkillProfileSchema.shape.adaptation
    .unwrap()
    .parse({ ...proposed, upstreamDigest: pkg.packageDigest });
  const adapted = applySkillAdaptation(files, pkg, adaptation);
  const equivalent = await ai.reviewAdaptation(
    { original, adapted: readAssessmentFiles(adapted.files), capabilities },
    signal,
  );
  signal?.throwIfAborted();
  if (!equivalent) return null;
  const profile = await assessSkillPackage(
    ai,
    adapted.package,
    adapted.files,
    pluginCatalog,
    signal,
  );
  return {
    ...adapted,
    profile: { ...profile, adaptation } satisfies SkillProfile,
    originalFiles: files,
  };
}
