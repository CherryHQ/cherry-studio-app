import type { AgentSkillProjection } from '@/backend/data/services/AgentGlobalSkillService';
import type { SkillEnvironmentFacts } from '@/backend/services/skill/skillAdmission';
import type { Skill } from '@/shared/data/types/skill';
import { sha256HexOfText } from '@/shared/utils/sha256';

import type { RuntimeTool } from '../../runtime';
import { createSkillScopeSource } from '../skillScope';

jest.mock('@/backend/services/skill/skillStorage', () => ({}));

const encoder = new TextEncoder();
const environment: SkillEnvironmentFacts = {
  platform: 'ios',
  permissions: {},
  webSearchAvailability: { fetchUrls: true, searchKeywords: true },
  hasPaintingModel: false,
  connectedPlugins: new Map(),
};

function skill(
  id: string,
  requirements: Partial<Skill['profile']['requirements']> = {},
  provenance: Skill['profile']['provenance'] = 'reviewed',
): Skill {
  return {
    id,
    name: id,
    description: `${id} description`,
    folderName: id,
    source: 'builtin',
    sourceUrl: null,
    author: null,
    version: null,
    tags: [],
    contentHash: `digest-${id}`,
    manifest: [
      {
        path: 'SKILL.md',
        size: 1,
        digest: sha256HexOfText(`---\nname: ${id}\ndescription: d\n---\nBody of digest-${id}`),
      },
    ],
    profile: {
      provenance,
      requirements: {
        platforms: null,
        execution: 'none',
        builtInTools: [],
        pluginTools: [],
        ...requirements,
      },
      workflowScope: null,
    },
    invocation: { modelInvocable: true, userInvocable: true },
    isEnabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const projection = (s: Skill): AgentSkillProjection => ({
  skill: s,
  binding: {
    agentId: 'agent',
    skillId: s.id,
    isEnabled: true,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  },
});

describe('createSkillScopeSource', () => {
  it('keeps ready Skills, drops blocked or missing packages, and pins revisions', async () => {
    const source = createSkillScopeSource({
      skills: {
        listUsableForAgent: async () =>
          [
            skill('ready'),
            skill('analyzed', {}, 'analyzed'),
            skill('needs-image', { builtInTools: ['generate_image'] }),
            skill('needs-python', { execution: 'python' }),
            skill('missing'),
          ].map(projection),
      },
      storage: {
        hasRevision: ({ folderName }) => folderName !== 'missing',
        readFile: async ({ folderName, contentHash }, path) =>
          path === 'SKILL.md'
            ? encoder.encode(
                `---\nname: ${folderName}\ndescription: d\n---\nBody of ${contentHash}`,
              )
            : null,
      },
      environment: { read: async () => environment },
      models: { getById: async () => ({ capabilities: ['function-call'] }) as never },
    });
    const scope = await source.resolve({
      agentId: 'agent',
      tools: [],
      disabledCapabilities: [],
      model: { providerId: 'p', modelId: 'm' },
      signal: new AbortController().signal,
    });
    expect(scope.entries.map((entry) => [entry.id, entry.admission.status])).toEqual([
      ['ready', 'ready'],
      ['analyzed', 'ready'],
    ]);
    expect(await scope.readInstructions('ready')).toBe('Body of digest-ready');
    expect(await scope.readInstructions('needs-python')).toBeNull();
    expect(await scope.readFile('ready', 'SKILL.md')).toBeInstanceOf(Uint8Array);
    expect(await scope.readFile('missing', 'SKILL.md')).toBeNull();
    expect(await scope.readFile('ready', 'unlisted.md')).toBeNull();
  });

  it('applies the Agent deny-list and model facts to eligibility', async () => {
    const source = createSkillScopeSource({
      skills: {
        listUsableForAgent: async () => [
          projection(skill('web', { builtInTools: ['web_search'] })),
        ],
      },
      storage: { hasRevision: () => true, readFile: async () => null },
      environment: { read: async () => environment },
      models: { getById: async () => ({ capabilities: ['function-call'] }) as never },
    });
    const base = {
      agentId: 'agent',
      tools: [{ ref: { source: 'builtin', capabilityId: 'web_search' } }] as RuntimeTool[],
      model: { providerId: 'p', modelId: 'm' },
      signal: new AbortController().signal,
    };
    expect((await source.resolve({ ...base, disabledCapabilities: [] })).entries).toHaveLength(1);
    expect(
      (await source.resolve({ ...base, disabledCapabilities: [], tools: [] })).entries,
    ).toHaveLength(0);
    expect((await source.resolve({ ...base, disabledCapabilities: ['web'] })).entries).toHaveLength(
      0,
    );
  });
});
