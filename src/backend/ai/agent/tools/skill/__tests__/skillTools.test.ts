import { SKILL_ACTIVE_MAX_CHARACTERS } from '@/shared/data/types/skill';

import type { SkillTurnEntry, SkillTurnScope } from '../../../host/skillScope';
import { createExpandingSkillScope } from '../../../host/skillScope';
import type { RuntimeTool } from '../../../runtime';
import { createSkillTools } from '../skillTools';

const encoder = new TextEncoder();

function entry(overrides: Partial<SkillTurnEntry> & { id: string; name: string }): SkillTurnEntry {
  return {
    description: `${overrides.name} description`,
    invocation: { modelInvocable: true, userInvocable: true },
    contentHash: 'abcdef0123456789',
    folderName: overrides.name,
    files: ['SKILL.md', 'references/format.md'],
    limitations: { scripts: [], unavailableTools: [] },
    ...overrides,
  };
}

function createScope(entries: SkillTurnEntry[]): SkillTurnScope {
  return {
    entries,
    readInstructions: async (skillId) =>
      entries.some((e) => e.id === skillId) ? `# ${skillId}\n\nDo it.` : null,
    readFile: async (skillId, path) =>
      path === 'references/format.md' && entries.some((e) => e.id === skillId)
        ? encoder.encode('line 1\nline 2\nline 3')
        : path === 'assets/logo.png'
          ? new Uint8Array([0xff, 0xfe, 0x00, 0x80])
          : null,
  };
}

const signal = new AbortController().signal;
const run = (tool: RuntimeTool, input: unknown) =>
  tool
    .execute({ input: input as never, signal, toolCallId: 'call', turnId: 'turn-1' })
    .then((r) => r.value as Record<string, unknown>);
const toolNamed = (tools: RuntimeTool[], name: string) =>
  tools.find((t) => t.providerName === name)!;
/** The body reaches the model as a system contribution, never through the stored receipt. */
const loadedBody = (tools: RuntimeTool[], skillId: string) =>
  toolNamed(tools, 'load_skill')
    .execute({ input: { skill_id: skillId }, signal, toolCallId: 'call', turnId: 'turn-1' })
    .then((r) => r.instructions?.text);

describe('skill tools', () => {
  const scope = createScope([
    entry({ id: 'a', name: 'daily-agenda' }),
    entry({ id: 'b', name: 'research-brief' }),
    entry({
      id: 'manual',
      name: 'manual-only',
      invocation: { modelInvocable: false, userInvocable: true },
    }),
  ]);
  let tools: RuntimeTool[];
  beforeEach(() => {
    tools = createSkillTools(scope);
  });

  it('lists only model-invocable Skills inside the scope', async () => {
    const list = toolNamed(tools, 'list_local_skills');
    expect(await run(list, {})).toMatchObject({
      total: 2,
      automaticTotal: 2,
      returned: 2,
      nextCursor: null,
      skills: [
        { skill_id: 'a', name: 'daily-agenda' },
        { skill_id: 'b', name: 'research-brief' },
      ],
    });
  });

  it('returns complete multilingual descriptions for model selection without loading instructions', async () => {
    const entries = [
      entry({
        id: 'minutes',
        name: 'meeting-notes',
        description: `${'Meeting context. '.repeat(100)}Use to summarize discussions and extract action items.`,
      }),
      entry({ id: 'travel', name: '旅行计划', description: '规划行程，安排交通和住宿。' }),
    ];
    const readInstructions = jest.fn(async () => null);
    const list = toolNamed(
      createSkillTools({ ...createScope(entries), readInstructions }),
      'list_local_skills',
    );
    expect(await run(list, {})).toMatchObject({
      total: 2,
      skills: entries.map(({ id, name, description }) => ({ skill_id: id, name, description })),
    });
    expect(readInstructions).not.toHaveBeenCalled();
  });

  it('includes manual-only metadata for an explicit inventory without granting loading access', async () => {
    const list = toolNamed(tools, 'list_local_skills');
    expect(await run(list, { include_manual: true })).toMatchObject({
      total: 3,
      automaticTotal: 2,
      returned: 3,
      skills: [
        { skill_id: 'a', invocation: { modelInvocable: true, userInvocable: true } },
        { skill_id: 'b', invocation: { modelInvocable: true, userInvocable: true } },
        { skill_id: 'manual', invocation: { modelInvocable: false, userInvocable: true } },
      ],
      nextCursor: null,
    });
    expect(await run(toolNamed(tools, 'load_skill'), { skill_id: 'manual' })).toMatchObject({
      status: 'error',
    });
    expect(await run(list, {})).toMatchObject({
      total: 2,
      skills: [{ skill_id: 'a' }, { skill_id: 'b' }],
    });
  });

  it('enumerates every page and refreshes the count after a conversation installation', async () => {
    const entries = Array.from({ length: 45 }, (_, index) =>
      entry({ id: `skill-${index}`, name: `skill-${index}` }),
    );
    const expanding = createExpandingSkillScope(createScope(entries));
    const list = toolNamed(createSkillTools(expanding.scope), 'list_local_skills');
    const ids: string[] = [];
    let cursor: string | null = null;
    const pageSizes: number[] = [];
    do {
      const page = await run(list, cursor ? { cursor } : {});
      expect(page.total).toBe(45);
      pageSizes.push(page.returned as number);
      ids.push(...(page.skills as { skill_id: string }[]).map(({ skill_id }) => skill_id));
      cursor = page.nextCursor as string | null;
    } while (cursor);
    expect(pageSizes).toEqual([20, 20, 5]);
    expect(ids).toEqual(entries.map(({ id }) => id));

    const installed = entry({ id: 'installed', name: 'installed' });
    expect(expanding.include(createScope([installed]), installed.id, installed.contentHash)).toBe(
      true,
    );
    expect(await run(list, { cursor: '40' })).toMatchObject({
      total: 46,
      returned: 6,
      skills: [...entries.slice(40), installed].map(({ id }) => ({ skill_id: id })),
      nextCursor: null,
    });
  });

  it('loads instructions and lists files only for scoped Skills', async () => {
    tools = createSkillTools(scope);
    const load = toolNamed(tools, 'load_skill');
    // The stored receipt names the Skill and its resources; it never repeats the body.
    const receipt = await run(load, { skill_id: 'a' });
    expect(receipt).toMatchObject({
      status: 'ok',
      skill_id: 'a',
      revision: 'abcdef012345',
      files: ['references/format.md'],
      instructionsInSystem: true,
    });
    expect(receipt).not.toHaveProperty('instructions');
    expect(await run(load, { skill_id: 'manual' })).toMatchObject({ status: 'error' });
    expect(await run(load, { skill_id: 'a' })).toMatchObject({ alreadyLoaded: true });
    // Every successful read carries the complete pinned instructions.
    expect(await loadedBody(tools, 'a')).toContain('# a\n\nDo it.');
    const selectedTools = createSkillTools(scope, {
      loadedSkillIds: ['manual'],
      explicitSkillIds: ['manual'],
    });
    expect(await run(toolNamed(selectedTools, 'load_skill'), { skill_id: 'manual' })).toMatchObject(
      { status: 'ok', alreadyLoaded: true, activation: { origin: 'explicit' } },
    );
    expect(await loadedBody(selectedTools, 'manual')).toContain('# manual\n\nDo it.');
    expect(await run(load, { skill_id: 'other' })).toMatchObject({ status: 'error' });
    expect(
      await run(toolNamed(tools, 'list_skill_files'), { skill_id: 'a', prefix: 'references/' }),
    ).toEqual({
      skill_id: 'a',
      name: 'daily-agenda',
      files: ['references/format.md'],
    });
  });

  it('recovers an already active body even when the unique instruction budget is full', async () => {
    const tools = createSkillTools(scope, {
      loadedSkillIds: ['a'],
      instructionCharacters: SKILL_ACTIVE_MAX_CHARACTERS,
    });
    const load = toolNamed(tools, 'load_skill');
    expect(await run(load, { skill_id: 'a' })).toMatchObject({ alreadyLoaded: true });
    expect(await loadedBody(tools, 'a')).toContain('# a\n\nDo it.');
    expect(await run(load, { skill_id: 'b' })).toMatchObject({ status: 'error' });
  });

  it('emits trusted retained instructions for a new load, with references still readable', async () => {
    const result = await toolNamed(tools, 'load_skill').execute({
      input: { skill_id: 'a' },
      signal,
      toolCallId: 'read',
      turnId: 'turn',
    });
    expect(result.instructions).toMatchObject({
      key: 'skill:a',
      text: expect.stringContaining('<skill_instructions>\n# a\n\nDo it.\n</skill_instructions>'),
    });
    expect(
      await run(toolNamed(tools, 'read_skill_file'), {
        skill_id: 'a',
        path: 'references/format.md',
      }),
    ).toMatchObject({
      status: 'ok',
      text: 'line 1\nline 2\nline 3',
    });
  });

  it('reads package files as line windows and reports binary files as metadata', async () => {
    const read = toolNamed(tools, 'read_skill_file');
    expect(await run(read, { skill_id: 'a', path: 'references/format.md' })).toMatchObject({
      status: 'error',
    });
    await run(toolNamed(tools, 'load_skill'), { skill_id: 'a' });
    expect(
      await run(read, { skill_id: 'a', path: 'references/format.md', start_line: 2, limit: 1 }),
    ).toMatchObject({
      status: 'ok',
      startLine: 2,
      lineCount: 1,
      totalLines: 3,
      truncated: true,
      text: 'line 2',
    });
    expect(await run(read, { skill_id: 'a', path: '../SKILL.md' })).toMatchObject({
      status: 'error',
    });
    expect(await run(read, { skill_id: 'a', path: 'assets/logo.png' })).toMatchObject({
      status: 'error',
    });
    const binaryScope = createScope([
      entry({ id: 'a', name: 'x', files: ['SKILL.md', 'assets/logo.png'] }),
    ]);
    expect(
      await run(
        toolNamed(createSkillTools(binaryScope, { loadedSkillIds: ['a'] }), 'read_skill_file'),
        {
          skill_id: 'a',
          path: 'assets/logo.png',
        },
      ),
    ).toMatchObject({
      status: 'binary',
      size: 4,
    });
  });
});
