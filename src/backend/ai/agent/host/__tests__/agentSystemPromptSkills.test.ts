import { createSkillTools } from '../../tools/skill/skillTools';
import { buildAgentSystemPrompt, buildInitialSkillInstructions } from '../agentSystemPrompt';
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
    limitations: { scripts: [], unavailableTools: [] },
    ...overrides,
  };
}

const base = {
  agentInstructions: '',
  appLanguage: 'en-US' as const,
  tools: [],
};

describe('agent system prompt Skills section', () => {
  it('omits the section without usable Skills', () => {
    expect(buildAgentSystemPrompt({ ...base, skills: EMPTY_TURN_SKILL_PLAN })).not.toContain(
      '## Skills',
    );
  });

  it('reports an empty Agent inventory when Skill discovery is available', () => {
    const prompt = buildAgentSystemPrompt({
      ...base,
      tools: createSkillTools(EMPTY_SKILL_SCOPE),
      skills: EMPTY_TURN_SKILL_PLAN,
    });
    expect(prompt).toContain('This Agent has no enabled, bound and readable Skill packages');
    expect(prompt).toContain("not the app's installed total");
    expect(prompt).toContain(
      '`list_local_skills` with `include_manual: true` and report its `total`',
    );
    expect(prompt).not.toContain('### Available Skills');
    expect(prompt).not.toContain('nextCursor');
    expect(prompt).toContain('are offered directly; do not search for them');
  });

  it('routes inventory questions to the authoritative tool count', () => {
    const entries = Array.from({ length: 45 }, (_, index) => entry(`skill-${index}`));
    const prompt = buildAgentSystemPrompt({
      ...base,
      skills: { selected: [], scope: { ...EMPTY_SKILL_SCOPE, entries } },
    });
    expect(prompt).toContain('45 automatically discoverable Skills');
    expect(prompt).toContain('45 enabled, bound and readable Skill packages');
    expect(prompt).toContain(
      '`list_local_skills` with `include_manual: true` and report its `total`',
    );
    expect(prompt).toContain('(40 of 45)');
    expect(prompt).toContain('until `nextCursor` is null');
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
    expect(prompt).toContain(
      'by meaning, including across languages; shared keywords are not required',
    );
    expect(prompt).not.toContain('cursor: "');
    expect(prompt).not.toContain('<skill_instructions>');
  });

  it('bounds the catalog by whole entries and directs discovery to unfiltered metadata listing', () => {
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
    expect(prompt).toContain(
      `Call list_local_skills with \`cursor: "${lines.length}"\` to list unfiltered metadata for the rest`,
    );
    expect(prompt).toContain(
      'until `nextCursor` is null before concluding that no local Skill fits',
    );
  });

  it('lists model-invocable Skills and routes explicit selections to current system sections', () => {
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
    expect(prompt).toContain('3 enabled, bound and readable Skill packages');
    expect(prompt).toContain('2 automatically discoverable Skills');
    expect(prompt).toContain('- a (skill_id: a): a description');
    expect(prompt).toContain('- b (skill_id: b): b description');
    expect(prompt).toContain('### Selected Skills');
    expect(prompt).toContain('- manual (skill_id: manual)');
    expect(prompt).not.toContain('Follow the manual.');
    expect(prompt).toContain('`list_skill_files` and `read_skill_file`');
    expect(prompt).toContain('built-in tools exposed directly to you');
    expect(prompt).toContain('no tool call or SKILL.md file lookup is needed');
    expect(prompt).toContain('you need not use every one');
    expect(prompt.indexOf('## Skills')).toBeLessThan(
      prompt.indexOf('## Agent Instructions') === -1
        ? Infinity
        : prompt.indexOf('## Agent Instructions'),
    );
  });

  it('seeds selected and active bodies as individually replaceable system sections', () => {
    const selected = { entry: entry('selected'), instructions: 'Selected body.' };
    const active = { entry: entry('active'), instructions: 'Active body.' };
    const sections = buildInitialSkillInstructions({
      scope: EMPTY_SKILL_SCOPE,
      selected: [selected],
      active: new Map([['active', active]]),
    });
    expect(sections.map(({ key }) => key)).toEqual(['skill:selected', 'skill:active']);
    expect(sections[0]?.text).toContain(
      '<skill_instructions>\nSelected body.\n</skill_instructions>',
    );
    expect(sections[1]?.text).toContain(
      '<skill_instructions>\nActive body.\n</skill_instructions>',
    );
  });
});
