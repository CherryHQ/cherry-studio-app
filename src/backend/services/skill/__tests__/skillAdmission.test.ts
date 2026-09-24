import type { SkillProfile } from '@/shared/data/types/skill';

import {
  analyzeSkillRequirements,
  evaluateSkillAdmission,
  type SkillEnvironmentFacts,
} from '../skillAdmission';
import { validateSkillPackage } from '../skillPackage';

const environment: SkillEnvironmentFacts = {
  platform: 'ios',
  permissions: { 'calendar.read': { state: 'undetermined', canAskAgain: true } },
  webSearchAvailability: { fetchUrls: true, searchKeywords: false },
  hasPaintingModel: false,
  connectedPlugins: new Map([['github', new Set(['issue_read'])]]),
};

function profile(
  overrides: Partial<SkillProfile['requirements']>,
  provenance: SkillProfile['provenance'] = 'reviewed',
): SkillProfile {
  return {
    packageDigest: 'digest',
    provenance,
    requirements: {
      platforms: null,
      execution: 'none',
      builtInTools: [],
      pluginTools: [],
      ...overrides,
    },
    workflowScope: null,
  };
}

describe('evaluateSkillAdmission', () => {
  it('distinguishes ready, setup required, unsupported, and unknown', () => {
    expect(
      evaluateSkillAdmission(
        profile({ builtInTools: ['calendar_list_events'] }),
        'digest',
        environment,
      ),
    ).toEqual({
      status: 'ready',
      reasons: [],
    });
    expect(
      evaluateSkillAdmission(
        profile({ builtInTools: ['web_search', 'generate_image'] }),
        'digest',
        environment,
      ),
    ).toEqual({
      status: 'setup-required',
      reasons: [
        { code: 'web-search-unconfigured', subject: 'web_search' },
        { code: 'drawing-model-unconfigured', subject: 'generate_image' },
      ],
    });
    expect(evaluateSkillAdmission(profile({ execution: 'python' }), 'digest', environment)).toEqual(
      {
        status: 'unsupported',
        reasons: [{ code: 'execution-unsupported', subject: 'python' }],
      },
    );
    expect(
      evaluateSkillAdmission(profile({ builtInTools: ['reminder_list_items'] }), 'digest', {
        ...environment,
        platform: 'android',
      }),
    ).toMatchObject({ status: 'unsupported', reasons: [{ code: 'capability-unavailable' }] });
    expect(evaluateSkillAdmission(profile({}, 'analyzed'), 'digest', environment)).toEqual({
      status: 'unknown',
      reasons: [{ code: 'unverified', subject: null }],
    });
    expect(evaluateSkillAdmission(profile({}), 'other-digest', environment)).toMatchObject({
      status: 'unknown',
      reasons: [{ code: 'profile-digest-mismatch' }],
    });
  });

  it('treats plugins and permissions as setup, and unavailable plugin tools as unsupported', () => {
    expect(
      evaluateSkillAdmission(
        profile({ pluginTools: [{ pluginId: 'feishu', tools: ['search'] }] }),
        'digest',
        environment,
      ),
    ).toEqual({
      status: 'setup-required',
      reasons: [{ code: 'plugin-not-connected', subject: 'feishu' }],
    });
    expect(
      evaluateSkillAdmission(
        profile({ pluginTools: [{ pluginId: 'github', tools: ['issue_write'] }] }),
        'digest',
        environment,
      ),
    ).toMatchObject({
      status: 'unsupported',
      reasons: [{ code: 'plugin-tool-unavailable', subject: 'github:issue_write' }],
    });
    const denied: SkillEnvironmentFacts = {
      ...environment,
      permissions: { 'calendar.read': { state: 'denied', canAskAgain: false } },
    };
    expect(
      evaluateSkillAdmission(profile({ builtInTools: ['calendar_list_events'] }), 'digest', denied),
    ).toEqual({
      status: 'setup-required',
      reasons: [{ code: 'permission-denied', subject: 'calendar.read' }],
    });
  });

  it('adds Agent-scope reasons without changing application-scope results', () => {
    const result = evaluateSkillAdmission(
      profile({ builtInTools: ['calendar_list_events'] }),
      'digest',
      environment,
      {
        disabledCapabilities: ['calendar'],
        supportsToolCalling: false,
      },
    );
    expect(result).toEqual({
      status: 'setup-required',
      reasons: [
        { code: 'capability-disabled', subject: 'calendar' },
        { code: 'model-tool-calling-unsupported', subject: null },
      ],
    });
  });
});

describe('analyzeSkillRequirements', () => {
  const encoder = new TextEncoder();
  const analyze = (entry: string, extra: Record<string, string> = {}) => {
    const validation = validateSkillPackage(
      new Map(
        Object.entries({ 'SKILL.md': entry, ...extra }).map(([p, t]) => [p, encoder.encode(t)]),
      ),
    );
    if (!validation.ok) throw new Error(JSON.stringify(validation.issues));
    return analyzeSkillRequirements(
      validation.package,
      new Map([['github', new Set(['issue_read'])]]),
    );
  };

  it('detects referenced scripts and interpreter commands as execution requirements', () => {
    expect(
      analyze('---\nname: x\ndescription: d\n---\nRun `python scripts/fill.py` first.', {
        'scripts/fill.py': 'print(1)',
      }).requirements,
    ).toMatchObject({ execution: 'python' });
    expect(
      analyze('---\nname: x\ndescription: d\n---\n```bash\nnpx prettier --write .\n```')
        .requirements,
    ).toMatchObject({ execution: 'node' });
    // Prose mentioning Python is not a command.
    expect(
      analyze('---\nname: x\ndescription: d\n---\nThis was written by a python fan.').requirements,
    ).toMatchObject({ execution: 'none' });
    // An unreferenced helper script does not make the workflow depend on it.
    expect(
      analyze('---\nname: x\ndescription: d\n---\nJust write.', { 'scripts/helper.sh': 'echo' })
        .requirements,
    ).toMatchObject({ execution: 'none' });
  });

  it('collects explicitly named Cherry tools and plugin tools', () => {
    const result = analyze(
      '---\nname: x\ndescription: d\n---\nCall calendar_list_events then web_search; use `github issue_read`.',
    );
    expect(result).toMatchObject({
      provenance: 'analyzed',
      requirements: {
        builtInTools: ['calendar_list_events', 'web_search'],
        pluginTools: [{ pluginId: 'github', tools: ['issue_read'] }],
      },
    });
  });
});
