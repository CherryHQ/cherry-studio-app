import { SKILL_ACTIVE_MAX_CHARACTERS } from '@/shared/data/types/skill';

import type { SkillTurnEntry, SkillTurnScope } from '../../../host/skillScope';
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
    admission: { status: 'ready', reasons: [] },
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

  it('searches only model-invocable Skills inside the scope with stable paging', async () => {
    const search = toolNamed(tools, 'search_local_skills');
    expect(await run(search, { query: '' })).toMatchObject({
      total: 2,
      matched: 2,
      returned: 2,
      nextCursor: null,
      skills: [
        { skill_id: 'a', name: 'daily-agenda', environment: { status: 'ready', reasons: [] } },
        { skill_id: 'b', name: 'research-brief', environment: { status: 'ready', reasons: [] } },
      ],
    });
    expect(await run(search, { query: 'RESEARCH' })).toMatchObject({
      matched: 1,
      skills: [{ skill_id: 'b' }],
    });
    expect(await run(search, { query: 'manual' })).toMatchObject({ matched: 0, skills: [] });
  });

  it('loads instructions and lists files only for scoped Skills', async () => {
    tools = createSkillTools(scope);
    const load = toolNamed(tools, 'load_skill');
    // Every successful read carries the complete pinned instructions.
    expect(await run(load, { skill_id: 'a' })).toMatchObject({
      status: 'ok',
      skill_id: 'a',
      revision: 'abcdef012345',
      files: ['references/format.md'],
      instructions: '# a\n\nDo it.',
    });
    expect(await run(load, { skill_id: 'manual' })).toMatchObject({ status: 'error' });
    const repeated = await run(load, { skill_id: 'a' });
    expect(repeated).toMatchObject({ alreadyLoaded: true, instructions: '# a\n\nDo it.' });
    const selectedTools = createSkillTools(scope, {
      loadedSkillIds: ['manual'],
      explicitSkillIds: ['manual'],
    });
    expect(await run(toolNamed(selectedTools, 'load_skill'), { skill_id: 'manual' })).toMatchObject(
      {
        status: 'ok',
        alreadyLoaded: true,
        instructions: '# manual\n\nDo it.',
        activation: { origin: 'explicit' },
      },
    );
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
    expect(await run(load, { skill_id: 'a' })).toMatchObject({
      alreadyLoaded: true,
      instructions: '# a\n\nDo it.',
    });
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
