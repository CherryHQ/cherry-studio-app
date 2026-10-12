import { buildAgentSystemPrompt } from '../agentSystemPrompt';
import { EMPTY_SKILL_SCOPE, type SkillTurnEntry } from '../skillScope';
import { EMPTY_TURN_SKILL_PLAN } from '../turnPreparation';

function entry(id: string, overrides: Partial<SkillTurnEntry> = {}): SkillTurnEntry {
  return {
    id,
    name: id,
    description: `${id} description`,
    invocation: { modelInvocable: true, userInvocable: true },
    contentHash: 'abcdef0123456789',
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

  it('preserves routing conditions at the end of long descriptions without loading bodies', () => {
    const description = `${'Detailed context. '.repeat(25)}Use when the user asks to reconcile an invoice.`;
    const prompt = buildAgentSystemPrompt({
      ...base,
      skills: {
        selected: [],
        scope: { ...EMPTY_SKILL_SCOPE, entries: [entry('invoices', { description })] },
      },
    });
    expect(prompt).toContain(description);
    expect(prompt).not.toContain('<skill_instructions>');
  });

  it('bounds the catalog by whole entries and directs discovery to metadata search', () => {
    const entries = Array.from({ length: 20 }, (_, index) =>
      entry(`skill-${index}`, { description: `${'Context. '.repeat(105)}Use for task ${index}.` }),
    );
    const prompt = buildAgentSystemPrompt({
      ...base,
      skills: { selected: [], scope: { ...EMPTY_SKILL_SCOPE, entries } },
    });
    const lines = prompt.split('\n').filter((line) => line.startsWith('- skill-'));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThan(entries.length);
    expect([...lines.join('\n')].length).toBeLessThanOrEqual(12_000);
    for (const [index, line] of lines.entries()) expect(line).toContain(`Use for task ${index}.`);
    expect(prompt).toContain(`### Available Skills (${lines.length} of 20)`);
    expect(prompt).toContain('omitted entries remain discoverable through search_local_skills');
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
    expect(prompt).toContain('read the needed references or templates with `read_skill_file`');
    expect(prompt).toContain('repeat `load_skill` to recover a missing instruction body');
    expect(prompt).not.toContain('without another loading call, file lookup');
    expect(prompt).toContain('built-in tools exposed directly to you');
    expect(prompt).toContain('no tool call or SKILL.md file lookup is needed');
    expect(prompt).toContain('does not require you to use every enabled Skill');
    expect(prompt.indexOf('## Skills')).toBeLessThan(
      prompt.indexOf('## Agent Instructions') === -1
        ? Infinity
        : prompt.indexOf('## Agent Instructions'),
    );
  });
});
