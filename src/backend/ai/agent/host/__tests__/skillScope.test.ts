import type { AgentSkillProjection } from '@/backend/data/services/AgentGlobalSkillService';
import type { Skill } from '@/shared/data/types/skill';
import { sha256HexOfText } from '@/shared/utils/sha256';

import { createSkillScopeSource } from '../skillScope';

jest.mock('@/backend/services/skill/skillStorage', () => ({}));

const encoder = new TextEncoder();

function skill(id: string, profile: Partial<Skill['profile']> = {}): Skill {
  return {
    id,
    name: id,
    description: `${id} description`,
    folderName: id,
    source: 'marketplace',
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
    profile: { scripts: [], declaredTools: [], ...profile },
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
  it('keeps readable Skills, states app limitations with their instructions, and excludes missing packages', async () => {
    const source = createSkillScopeSource({
      skills: {
        listUsableForAgent: async () =>
          [
            skill('plain'),
            skill('scripted', {
              scripts: ['scripts/run.py'],
              declaredTools: ['Bash', 'Read', 'mcp__docs__search'],
            }),
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
    });
    const scope = await source.resolve({
      agentId: 'agent',
      signal: new AbortController().signal,
    });
    expect(scope.entries.map((entry) => [entry.id, entry.limitations])).toEqual([
      ['plain', { scripts: [], unavailableTools: [] }],
      ['scripted', { scripts: ['scripts/run.py'], unavailableTools: ['Bash'] }],
    ]);
    expect(await scope.readInstructions('plain')).toBe('Body of digest-plain');
    const scripted = await scope.readInstructions('scripted');
    expect(scripted).toContain("cannot run the package's scripts: scripts/run.py");
    expect(scripted).toContain('does not provide: Bash.');
    expect(scripted).toContain('Body of digest-scripted');
    expect(await scope.readFile('plain', 'SKILL.md')).toBeInstanceOf(Uint8Array);
    expect(await scope.readFile('missing', 'SKILL.md')).toBeNull();
    expect(await scope.readFile('plain', 'unlisted.md')).toBeNull();
  });
});
