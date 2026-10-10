import type { SkillProfile } from '@/shared/data/types/skill';

import { evaluateSkillAdmission, type SkillEnvironmentFacts } from '../skillAdmission';

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
  it('distinguishes ready, setup required, and unsupported', () => {
    expect(
      evaluateSkillAdmission(profile({ builtInTools: ['calendar_list_events'] }), environment),
    ).toEqual({
      status: 'ready',
      reasons: [],
    });
    expect(
      evaluateSkillAdmission(
        profile({ builtInTools: ['web_search', 'generate_image'] }),
        environment,
      ),
    ).toEqual({
      status: 'setup-required',
      reasons: [
        { code: 'web-search-unconfigured', subject: 'web_search' },
        { code: 'drawing-model-unconfigured', subject: 'generate_image' },
      ],
    });
    expect(evaluateSkillAdmission(profile({ execution: 'python' }), environment)).toEqual({
      status: 'unsupported',
      reasons: [{ code: 'execution-unsupported', subject: 'python' }],
    });
    expect(
      evaluateSkillAdmission(profile({ builtInTools: ['reminder_list_items'] }), {
        ...environment,
        platform: 'android',
      }),
    ).toMatchObject({ status: 'unsupported', reasons: [{ code: 'capability-unavailable' }] });
    expect(evaluateSkillAdmission(profile({}, 'analyzed'), environment)).toEqual({
      status: 'unverified',
      reasons: [],
    });
  });

  it.each(['unverified', 'analyzed'] as const)(
    'does not treat %s requirements as verified dependencies',
    (provenance) => {
      expect(
        evaluateSkillAdmission(
          profile({ execution: 'python', builtInTools: ['web_search'] }, provenance),
          environment,
        ),
      ).toEqual({ status: 'unverified', reasons: [] });
    },
  );

  it('treats plugins and permissions as setup, and unavailable plugin tools as unsupported', () => {
    expect(
      evaluateSkillAdmission(
        profile({ pluginTools: [{ pluginId: 'feishu', tools: ['search'] }] }),
        environment,
      ),
    ).toEqual({
      status: 'setup-required',
      reasons: [{ code: 'plugin-not-connected', subject: 'feishu' }],
    });
    expect(
      evaluateSkillAdmission(
        profile({ pluginTools: [{ pluginId: 'github', tools: ['issue_write'] }] }),
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
      evaluateSkillAdmission(profile({ builtInTools: ['calendar_list_events'] }), denied),
    ).toEqual({
      status: 'setup-required',
      reasons: [{ code: 'permission-denied', subject: 'calendar.read' }],
    });
  });

  it('adds Agent-scope reasons without changing application-scope results', () => {
    const result = evaluateSkillAdmission(
      profile({ builtInTools: ['calendar_list_events'] }),
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
