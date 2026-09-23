import { buildAgentSystemPrompt } from '../agentSystemPrompt';
import { EMPTY_SKILL_SCOPE, type SkillTurnEntry } from '../skillScope';
import { EMPTY_TURN_SKILL_PLAN } from '../turnPreparation';

function entry(id: string, overrides: Partial<SkillTurnEntry> = {}): SkillTurnEntry {
  return {
    id,
    name: id,
    description: `${id} description`,
    invocation: { modelInvocable: true, userInvocable: true },
    packageDigest: 'abcdef0123456789',
    folderName: id,
    files: ['SKILL.md'],
    admission: { status: 'ready', reasons: [] },
    ...overrides,
  };
}

const base = {
  agentInstructions: '',
  appLanguage: 'en-US' as const,
  currentDate: '2026-09-22',
  tools: [],
};

describe('agent system prompt Skills section', () => {
  it('omits the section without usable Skills', () => {
    expect(buildAgentSystemPrompt({ ...base, skills: EMPTY_TURN_SKILL_PLAN })).not.toContain(
      '## Skills',
    );
  });

  it('lists model-invocable Skills with ids and quotes explicit selections', () => {
    const prompt = buildAgentSystemPrompt({
      ...base,
      skills: {
        scope: {
          ...EMPTY_SKILL_SCOPE,
          entries: [
            entry('a'),
            entry('b'),
            entry('manual', { invocation: { modelInvocable: false, userInvocable: true } }),
          ],
        },
        selected: [
          {
            entry: entry('manual', { invocation: { modelInvocable: false, userInvocable: true } }),
            instructions: 'Follow the manual.',
          },
        ],
      },
    });
    expect(prompt).toContain('## Skills');
    expect(prompt).toContain('- a (skill_id: a): a description');
    expect(prompt).toContain('- b (skill_id: b): b description');
    expect(prompt).not.toContain('- manual (skill_id');
    expect(prompt).toContain('### Selected Skills');
    expect(prompt).toContain('#### manual (skill_id: manual; revision abcdef012345)');
    expect(prompt).toContain('<skill_instructions>\nFollow the manual.\n</skill_instructions>');
    expect(prompt.indexOf('## Skills')).toBeLessThan(
      prompt.indexOf('## Agent Instructions') === -1
        ? Infinity
        : prompt.indexOf('## Agent Instructions'),
    );
  });
});
