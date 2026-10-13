import type { AgentUserQuestions } from '@/shared/contracts/agent';
import type { Skill } from '@/shared/data/types/skill';

import {
  createExpandingSkillScope,
  type SkillTurnEntry,
  type SkillTurnScope,
} from '../../../host/skillScope';
import { createSkillTools } from '../skillTools';

const original: SkillTurnEntry = {
  id: 'notes',
  name: 'notes',
  description: 'Summarize notes',
  contentHash: 'old',
  folderName: 'notes',
  files: ['SKILL.md', 'references/template.md'],
  invocation: { modelInvocable: true, userInvocable: true },
  admission: { status: 'unverified', reasons: [] },
};
const before = 'Optional: copy to desktop clipboard.';
const oldBody = `Summarize notes, preserve sources and verify output.\n${before}\nReturn the summary.`;
function scope(entry: SkillTurnEntry, body: string): SkillTurnScope {
  return { entries: [entry], readInstructions: async () => body, readFile: async () => null };
}
const input = {
  skill_id: 'notes',
  changes: [
    {
      before,
      after: '',
      reason: 'No desktop clipboard on this phone.',
      kind: 'remove-optional',
      replacement_tools: [],
    },
  ],
};
const call = { input, signal: new AbortController().signal, toolCallId: 'adapt', turnId: 'turn' };
const answer = (ids: string[], skipped = false, text = '') => ({
  answers: [{ questionId: 'skill-adaptation', selectedOptionIds: ids, skipped, text }],
});

function setup(response = answer(['adapt'])) {
  const expanded = createExpandingSkillScope(scope(original, oldBody));
  const updated = { ...original, contentHash: 'new' };
  const nextBody = oldBody.replace(before, '');
  const source = { resolve: jest.fn(async () => scope(original, oldBody)) };
  const workflow = {
    previewAdaptation: jest.fn(async () => ({
      skill: {} as Skill,
      previousInstructions: oldBody,
      instructions: nextBody,
    })),
    adapt: jest.fn(async () => {
      source.resolve.mockImplementation(async () => scope(updated, nextBody));
      return { ...updated } as unknown as Skill;
    }),
  };
  const askUser = jest.fn(async (_question: AgentUserQuestions) => response);
  const tools = createSkillTools(expanded.scope, {
    loadedSkillIds: ['notes'],
    instructionCharacters: [...oldBody].length,
    instructionLengths: new Map([['notes', [...oldBody].length]]),
    adaptation: {
      workflow,
      source,
      askUser,
      language: 'zh-CN',
      replace: expanded.replace,
      context: {
        agentId: 'agent',
        disabledCapabilities: [],
        model: { providerId: 'p', modelId: 'm' },
        tools: [],
      },
    },
  });
  return {
    expanded,
    tools,
    workflow,
    askUser,
    source,
    nextBody,
    adapt: tools.find((tool) => tool.providerName === 'adapt_skill')!,
  };
}

test.each([
  answer(['keep']),
  answer([], true),
  answer([], false, 'Explain first'),
  answer(['adapt'], false, 'Change the output too'),
])('does not save on rejection, skip or unresolved custom input', async (response) => {
  const state = setup(response);
  expect((await state.adapt.execute(call)).value).toMatchObject({ status: 'unchanged' });
  expect(state.workflow.adapt).not.toHaveBeenCalled();
  expect(state.expanded.scope.entries[0]?.contentHash).toBe('old');
});

test('shows exact changes through the existing question port, then replaces the current instruction section and scope', async () => {
  const state = setup();
  const result = await state.adapt.execute(call);
  expect(state.askUser.mock.calls[0]?.[0].questions[0]).toMatchObject({
    description: expect.stringContaining('所有'),
    textChanges: [{ before, after: '', reason: input.changes[0]!.reason }],
    options: [
      { id: 'adapt', label: '适配并继续' },
      { id: 'keep', label: '这次不修改' },
    ],
  });
  expect(result.value).toMatchObject({
    status: 'adapted',
    instructionsLoaded: true,
    changes: [{ before, after: '' }],
  });
  expect(result.instructions?.key).toBe('skill:notes');
  expect(result.instructions?.text).toContain(state.nextBody);
  expect(result.instructions?.text).not.toContain(before);
  expect(await state.expanded.scope.readInstructions('notes')).toBe(state.nextBody);
  const load = state.tools.find((tool) => tool.providerName === 'load_skill')!;
  expect((await load.execute({ ...call, input: { skill_id: 'notes' } })).value).toMatchObject({
    alreadyLoaded: true,
    instructions: state.nextBody,
  });
});

test('rejects deleting a required step and replacements naming unavailable tools before asking', async () => {
  const state = setup();
  for (const change of [
    { ...input.changes[0]!, before: 'Return the summary.' },
    {
      ...input.changes[0]!,
      kind: 'replace-execution',
      after: 'Run Python',
      replacement_tools: ['shell'],
    },
  ]) {
    expect(
      (await state.adapt.execute({ ...call, input: { skill_id: 'notes', changes: [change] } }))
        .value,
    ).toMatchObject({ status: 'error' });
  }
  expect(state.askUser).not.toHaveBeenCalled();
  expect(state.workflow.adapt).not.toHaveBeenCalled();
});

test('keeps the actual saved receipt when the post-save refresh fails', async () => {
  const state = setup();
  state.workflow.adapt.mockImplementation(async () => {
    state.source.resolve.mockRejectedValue(new Error('unreadable'));
    return { ...original, contentHash: 'new' } as unknown as Skill;
  });
  const result = await state.adapt.execute(call);
  expect(result.value).toMatchObject({
    status: 'adapted',
    instructionsLoaded: false,
    changes: [{ before, after: '' }],
  });
  expect(result.instructions).toBeUndefined();
});

test('never saves before the user has answered and refuses a changed access scope afterwards', async () => {
  const state = setup();
  let resolve!: (value: ReturnType<typeof answer>) => void;
  let entered!: () => void;
  const questionShown = new Promise<void>((done) => {
    entered = done;
  });
  state.askUser.mockImplementation(
    async () =>
      new Promise((done) => {
        resolve = done;
        entered();
      }),
  );
  const pending = state.adapt.execute(call);
  await questionShown;
  expect(state.workflow.adapt).not.toHaveBeenCalled();
  state.source.resolve.mockResolvedValue(
    scope({ ...original, contentHash: 'someone-else-saved' }, oldBody),
  );
  resolve(answer(['adapt']));
  expect((await pending).value).toMatchObject({ status: 'error', code: 'content-changed' });
  expect(state.workflow.adapt).not.toHaveBeenCalled();
});
