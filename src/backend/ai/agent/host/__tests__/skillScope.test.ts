import type { AgentSkillProjection } from '@/backend/data/services/AgentGlobalSkillService';
import type { Skill } from '@/shared/data/types/skill';
import { sha256HexOfText } from '@/shared/utils/sha256';

import { createSkillScopeSource } from '../skillScope';

jest.mock('@/backend/services/skill/skillStorage', () => ({}));

const encoder = new TextEncoder();

function skill(id: string, declaredTools: string[] = [], scripts: string[] = []): Skill {
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
      ...scripts.map((path) => ({ path, size: 1, digest: 'd' })),
    ],
    profile: { declaredTools },
    invocation: { modelInvocable: true, userInvocable: true },
    isEnabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const SCRIPTS = Array.from({ length: 150 }, (_, index) => `scripts/office/step-${index}.py`);

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
            skill('scripted', ['Bash', 'Read', 'mcp__docs__search'], SCRIPTS),
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
      ['scripted', { scripts: SCRIPTS, unavailableTools: ['Bash'] }],
    ]);
    expect(await scope.readInstructions('plain')).toBe('Body of digest-plain');
    const scripted = await scope.readInstructions('scripted');
    // Paths would spend the instruction budget the body is validated against at installation.
    expect(scripted).toContain('The 150 script file(s) in this package can only be read.');
    expect(scripted).not.toContain('scripts/');
    expect(scripted).toContain('does not provide: Bash.');
    expect(scripted).toContain('Body of digest-scripted');
    expect(await scope.readFile('plain', 'SKILL.md')).toBeInstanceOf(Uint8Array);
    expect(await scope.readFile('missing', 'SKILL.md')).toBeNull();
    expect(await scope.readFile('plain', 'unlisted.md')).toBeNull();
  });

  it('loads the Cherry environment and declared tools with the instruction body', async () => {
    const source = createSkillScopeSource({
      skills: { listUsableForAgent: async () => [projection(skill('cherry-agenda'))] },
      storage: {
        hasRevision: () => true,
        readFile: async () =>
          encoder.encode(
            [
              '---',
              'name: cherry-agenda',
              'description: Prepare an agenda',
              'compatibility: Designed for Cherry Studio App. Requires calendar access.',
              'allowed-tools: calendar_list_events write_file',
              '---',
              'Read the requested date range with calendar_list_events, then save the summary with write_file.',
            ].join('\n'),
          ),
      },
    });
    const scope = await source.resolve({ agentId: 'agent', signal: new AbortController().signal });
    const instructions = await scope.readInstructions('cherry-agenda');
    expect(instructions).toContain('Designed for Cherry Studio App. Requires calendar access.');
    expect(instructions).toContain(
      'Tools declared by this Skill: calendar_list_events, write_file.',
    );
    expect(instructions).toContain('does not enable tools or bypass approval');
    expect(instructions).toContain('save the summary with write_file.');
  });
});
