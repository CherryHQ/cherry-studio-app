import type { SkillInspection } from '@/shared/contracts/skills';
import type { Skill, SkillAdmission } from '@/shared/data/types/skill';
import { sha256HexOfText } from '@/shared/utils/sha256';

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
  source: { registry: 'bundled', locator: 'bundled:notes', revision: '1', url: null },
  author: null,
  version: null,
  license: null,
  compatibility: null,
  tags: [],
  entryDigest: 'e'.repeat(64),
  packageDigest: 'a'.repeat(64),
  manifest: [{ path: 'SKILL.md', size: 1, digest: 'e'.repeat(64) }],
  invocation: { modelInvocable: true, userInvocable: true },
  profile: {
    packageDigest: 'a'.repeat(64),
    provenance: 'reviewed',
    workflowScope: 'Notes',
    requirements: { platforms: null, execution: 'none', builtInTools: [], pluginTools: [] },
  },
  isGlobalEnabled: true,
  createdAt: '2026-09-23T00:00:00.000Z',
  updatedAt: '2026-09-23T00:00:00.000Z',
};
const inspection: SkillInspection = {
  candidate: {
    candidateId: 'issued',
    name: installed.name,
    description: installed.description,
    source: installed.source,
    author: null,
    version: null,
    tags: [],
    installedSkillId: null,
    profileProvenance: 'reviewed',
  },
  package: {
    ...installed,
    instructionsPreview: 'Write notes.',
  },
  issues: [],
  profile: installed.profile,
  admission: { status: 'ready', reasons: [] },
};
const checked: SkillTurnScope = {
  entries: [
    {
      id: installed.id,
      name: installed.name,
      description: installed.description,
      packageDigest: installed.packageDigest,
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
  return (await tool.execute({ input, signal, toolCallId: name })).value;
};

function fixture(installIntent = true) {
  let admission: SkillAdmission = { status: 'ready', reasons: [] };
  const workflow = {
    discover: jest.fn(async () => ({
      items: [{ candidate: inspection.candidate, reason: 'Notes' }],
      partial: false,
    })),
    prepare: jest.fn(async () => inspection),
    install: jest.fn(async () => installed),
  };
  const source: SkillScopeSource = {
    check: async () => admission,
    resolve: async () => checked,
  };
  const expanding = createExpandingSkillScope(EMPTY_SKILL_SCOPE);
  const loaded = jest.fn();
  // Readers are created before installation; later installation must become visible to them.
  const tools = [
    ...createSkillTools(expanding.scope, { onLoad: loaded }),
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
  return {
    tools,
    workflow,
    loaded,
    expanding,
    setAdmission: (value: SkillAdmission) => {
      admission = value;
    },
  };
}

describe('conversation Skill installation', () => {
  it('requires a discovered and ready candidate and rechecks actual tools before committing', async () => {
    const f = fixture();
    expect(await run(f.tools, 'install_skill', { candidate_id: 'guessed' })).toMatchObject({
      code: 'candidate-expired',
    });
    await run(f.tools, 'find_skills', { query: 'notes' });
    expect(await run(f.tools, 'install_skill', { candidate_id: 'issued' })).toMatchObject({
      code: 'admission-unverified',
    });
    await run(f.tools, 'prepare_skill', { candidate_id: 'issued' });
    f.setAdmission({
      status: 'setup-required',
      reasons: [{ code: 'capability-unavailable', subject: 'web_search' }],
    });
    expect(await run(f.tools, 'install_skill', { candidate_id: 'issued' })).toMatchObject({
      code: 'admission-setup-required',
    });
    expect(f.workflow.install).not.toHaveBeenCalled();
  });

  it('commits duplicate calls once, binds the current Agent and activates the accepted revision immediately', async () => {
    const f = fixture();
    await run(f.tools, 'find_skills', { query: 'notes' });
    await run(f.tools, 'prepare_skill', { candidate_id: 'issued' });
    const results = await Promise.all([
      run(f.tools, 'install_skill', { candidate_id: 'issued' }),
      run(f.tools, 'install_skill', { candidate_id: 'issued' }),
    ]);
    expect(results[0]).toMatchObject({ status: 'installed', availableThisTurn: true });
    expect(results[1]).toEqual(results[0]);
    expect(f.workflow.install).toHaveBeenCalledTimes(1);
    expect(f.workflow.install).toHaveBeenCalledWith(
      {
        candidateId: 'issued',
        agentIds: ['agent'],
        expectedPackageDigest: installed.packageDigest,
        expectedProfileDigest: sha256HexOfText(JSON.stringify(installed.profile)),
      },
      signal,
    );
    expect(await run(f.tools, 'load_skill', { skill_id: installed.id })).toMatchObject({
      status: 'ok',
    });
    expect(f.loaded).toHaveBeenCalledWith(checked.entries[0], 'Write notes.');
    await run(f.tools, 'install_skill', { candidate_id: 'issued' });
    expect(f.workflow.install).toHaveBeenCalledTimes(1);
  });

  it('preserves pinned revisions and refuses unrelated or unready additions', () => {
    const expanding = createExpandingSkillScope(checked);
    const changed = {
      ...checked,
      entries: [{ ...checked.entries[0]!, packageDigest: 'b'.repeat(64) }],
    };
    expect(expanding.include(changed, installed.id, 'b'.repeat(64))).toBe(false);
    expect(expanding.include(checked, 'another-skill', installed.packageDigest)).toBe(false);
    const blocked: SkillTurnScope = {
      ...checked,
      entries: [
        { ...checked.entries[0]!, id: 'blocked', admission: { status: 'unknown', reasons: [] } },
      ],
    };
    expect(expanding.include(blocked, 'blocked', installed.packageDigest)).toBe(false);
    expect(expanding.scope.entries).toEqual(checked.entries);
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
