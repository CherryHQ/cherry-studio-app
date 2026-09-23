import type { SkillAssessment, SkillRequirements } from '@/shared/data/types/skill';

import { evaluateSkillAdmission, type SkillEnvironmentFacts } from '../skillAdmission';
import { assessSkillPackage } from '../skillAssessment';
import { validateSkillPackage } from '../skillPackage';

const entry =
  '---\nname: notes\ndescription: Structure notes\n---\nUse references/outline.md to structure the user notes.';
const files = new Map([
  ['SKILL.md', new TextEncoder().encode(entry)],
  ['references/outline.md', new TextEncoder().encode('Use headings.')],
]);
const validation = validateSkillPackage(files);
if (!validation.ok) throw new Error('Invalid test package');
const pkg = validation.package;
const requirements: SkillRequirements = {
  platforms: null,
  execution: 'none',
  builtInTools: [],
  pluginTools: [],
};
const assessment: SkillAssessment = {
  version: 1,
  modelId: 'provider::model',
  assessedAt: '2026-09-22T00:00:00.000Z',
  decision: 'supported',
  summary: 'Structure notes without external execution.',
  uncertainties: [],
  evidence: [
    { path: 'SKILL.md', quote: 'Structure notes', explanation: 'Text workflow.' },
    { path: 'references/outline.md', quote: 'Use headings.', explanation: 'Text outline.' },
  ],
};
const environment: SkillEnvironmentFacts = {
  platform: 'ios',
  permissions: {},
  webSearchAvailability: { fetchUrls: false, searchKeywords: false },
  hasPaintingModel: false,
  connectedPlugins: new Map(),
};

it('binds an evidenced AI assessment to the complete package and still requires current capabilities', async () => {
  const profile = await assessSkillPackage(
    {
      assess: async () => ({
        requirements: { ...requirements, builtInTools: ['web_search'] },
        assessment,
      }),
    },
    pkg,
    files,
    new Map(),
  );
  expect(profile).toMatchObject({ provenance: 'ai-assessed', packageDigest: pkg.packageDigest });
  expect(evaluateSkillAdmission(profile, pkg.packageDigest, environment).status).toBe(
    'setup-required',
  );
  expect(evaluateSkillAdmission(profile, 'changed', environment).status).toBe('unknown');
  expect(
    evaluateSkillAdmission({ ...profile, requirements }, pkg.packageDigest, environment).status,
  ).toBe('ready');
  expect(
    evaluateSkillAdmission(
      { ...profile, assessment: { ...assessment, uncertainties: ['Unclear dependency'] } },
      pkg.packageDigest,
      environment,
    ).status,
  ).toBe('unknown');
});

it.each(['invented', 'omitted'] as const)('rejects %s package evidence', async (kind) => {
  const evidence =
    kind === 'invented'
      ? [{ ...assessment.evidence[0]!, quote: 'Not in the file' }, assessment.evidence[1]!]
      : assessment.evidence.slice(0, 1);
  await expect(
    assessSkillPackage(
      { assess: async () => ({ requirements, assessment: { ...assessment, evidence } }) },
      pkg,
      files,
      new Map(),
    ),
  ).rejects.toMatchObject({ code: 'ai-response-invalid' });
});

it('refuses incomplete binary assessment without making a model call', async () => {
  const assess = jest.fn(async () => ({ requirements, assessment }));
  await expect(
    assessSkillPackage(
      { assess },
      pkg,
      new Map([...files, ['asset.bin', new Uint8Array([0, 255])]]),
      new Map(),
    ),
  ).rejects.toMatchObject({ code: 'ai-package-too-large' });
  expect(assess).not.toHaveBeenCalled();
});
