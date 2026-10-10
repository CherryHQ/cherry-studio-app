import { SkillsError } from '@/shared/contracts/skills';
import type { Skill, SkillCandidate } from '@/shared/data/types/skill';

import {
  createExpandingSkillScope,
  EMPTY_SKILL_SCOPE,
  type SkillScopeSource,
  type SkillTurnScope,
} from '../../../host/skillScope';
import type { RuntimeTool } from '../../../runtime';
import { createSkillManagementTools } from '../skillManagementTools';
import { createSkillTools } from '../skillTools';

jest.mock('@/backend/services/skill/skillStorage', () => ({}));

const installed: Skill = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'notes',
  description: 'Take notes',
  folderName: 'notes',
  source: 'marketplace',
  sourceUrl: 'https://github.com/o/r/blob/main/notes/SKILL.md',
  author: null,
  version: null,
  tags: [],
  contentHash: 'a'.repeat(64),
  manifest: [{ path: 'SKILL.md', size: 1, digest: 'e'.repeat(64) }],
  invocation: { modelInvocable: true, userInvocable: true },
  profile: {
    provenance: 'reviewed',
    workflowScope: 'Notes',
    requirements: { platforms: null, execution: 'none', builtInTools: [], pluginTools: [] },
  },
  isEnabled: true,
  createdAt: '2026-09-23T00:00:00.000Z',
  updatedAt: '2026-09-23T00:00:00.000Z',
};
const candidate: SkillCandidate = {
  candidateId: 'issued',
  name: installed.name,
  description: installed.description,
  source: {
    registry: 'github',
    locator: 'github:o/r/notes',
    url: installed.sourceUrl,
    revision: 'commit',
  },
  author: null,
  version: null,
  tags: [],
  installedSkillId: null,
  profileProvenance: 'reviewed',
};
const checked: SkillTurnScope = {
  entries: [
    {
      id: installed.id,
      name: installed.name,
      description: installed.description,
      contentHash: installed.contentHash,
      folderName: installed.folderName,
      invocation: installed.invocation,
      files: ['SKILL.md'],
      admission: { status: 'ready', reasons: [] },
    },
  ],
  readInstructions: async () => 'Write notes.',
  readFile: async () => null,
};
const signal = new AbortController().signal;
const run = async (tools: RuntimeTool[], name: string, input: Record<string, string>) => {
  const tool = tools.find((item) => item.providerName === name)!;
  return (await tool.execute({ input, signal, toolCallId: name, turnId: 'turn-1' })).value;
};

function fixture(installIntent = true, candidates: SkillCandidate[] = [candidate]) {
  const workflow = {
    search: jest.fn(async () => [
      { name: 'notes', source: 'o/r', url: 'https://skills.sh/o/r/notes' },
    ]),
    resolve: jest.fn(async () => candidates),
    install: jest.fn(async () => installed),
  };
  const source: SkillScopeSource = { resolve: async () => checked };
  const expanding = createExpandingSkillScope(EMPTY_SKILL_SCOPE);
  // Readers are created before installation; later installation must become visible to them.
  const tools = [
    ...createSkillTools(expanding.scope),
    ...createSkillManagementTools({
      workflow,
      source,
      installIntent,
      include: expanding.include,
      context: {
        agentId: 'agent',
        disabledCapabilities: [],
        model: { providerId: 'p', modelId: 'm' },
        tools: [],
      },
    }),
  ];
  return { tools, workflow };
}

describe('conversation Skill installation', () => {
  it('searches by keywords and lists the Skills behind a URL without installing', async () => {
    const f = fixture();
    expect(await run(f.tools, 'find_skills', { query: 'notes' })).toMatchObject({
      skills: [{ url: 'https://skills.sh/o/r/notes' }],
    });
    expect(await run(f.tools, 'find_skills', { query: 'https://github.com/o/r' })).toMatchObject({
      skills: [{ name: 'notes', url: candidate.source.url, installed: false }],
    });
    expect(f.workflow.install).not.toHaveBeenCalled();
  });

  it('installs for the current Agent and activates the accepted revision immediately', async () => {
    const f = fixture();
    expect(await run(f.tools, 'install_skill', { url: candidate.source.url! })).toMatchObject({
      status: 'installed',
      availableThisTurn: true,
    });
    expect(f.workflow.install).toHaveBeenCalledWith(
      { candidateId: 'issued', agentIds: ['agent'] },
      signal,
    );
    expect(await run(f.tools, 'load_skill', { skill_id: installed.id })).toMatchObject({
      status: 'ok',
      instructions: 'Write notes.',
    });
  });

  it('asks the model to choose when a URL holds several Skills', async () => {
    const f = fixture(true, [candidate, { ...candidate, candidateId: 'other', name: 'other' }]);
    expect(await run(f.tools, 'install_skill', { url: 'https://github.com/o/r' })).toMatchObject({
      status: 'choose',
      skills: [{ name: 'notes' }, { name: 'other' }],
    });
    expect(f.workflow.install).not.toHaveBeenCalled();
  });

  it('returns package validation failures as tool results', async () => {
    const f = fixture();
    f.workflow.install.mockRejectedValueOnce(
      new SkillsError('package-invalid', 'Invalid Skill package'),
    );
    expect(await run(f.tools, 'install_skill', { url: candidate.source.url! })).toMatchObject({
      status: 'error',
      code: 'package-invalid',
    });
  });

  it('preserves pinned revisions and permits readable additions with execution limitations', () => {
    const expanding = createExpandingSkillScope(checked);
    const changed = {
      ...checked,
      entries: [{ ...checked.entries[0]!, contentHash: 'b'.repeat(64) }],
    };
    expect(expanding.include(changed, installed.id, 'b'.repeat(64))).toBe(false);
    expect(expanding.include(checked, 'another-skill', installed.contentHash)).toBe(false);
    const blocked: SkillTurnScope = {
      ...checked,
      entries: [
        {
          ...checked.entries[0]!,
          id: 'blocked',
          admission: { status: 'unsupported', reasons: [] },
        },
      ],
    };
    expect(expanding.include(blocked, 'blocked', installed.contentHash)).toBe(true);
    expect(expanding.scope.entries).toEqual([...checked.entries, ...blocked.entries]);
  });

  it('keeps ordinary install approval while the composer action supplies explicit install intent', () => {
    expect(
      fixture(false).tools.find((tool) => tool.providerName === 'install_skill')!.approval,
    ).toBe('ask');
    expect(
      fixture(true).tools.find((tool) => tool.providerName === 'install_skill')!.approval,
    ).toBe('auto');
  });
});
