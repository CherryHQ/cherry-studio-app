import { SkillsError } from '@/shared/contracts/skills';
import type { Skill } from '@/shared/data/types/skill';

import { createSkillCreationTool } from '../skillCreationTool';

const input = {
  name: 'notes',
  description: 'When asked for notes',
  instructions: 'Write concise notes.',
};
const skill = { id: '00000000-0000-4000-8000-000000000001', name: 'notes' } as Skill;

function fixture() {
  const workflow = { create: jest.fn(async () => skill) };
  const tool = createSkillCreationTool(workflow);
  return { workflow, tool };
}

test('saves content directly without adding an Agent target or activating instructions', async () => {
  const { workflow, tool } = fixture();
  const signal = new AbortController().signal;
  const result = await tool.execute({ input, signal, turnId: 'turn', toolCallId: 'create' });
  expect(workflow.create).toHaveBeenCalledWith(input, signal);
  expect(result).toEqual({
    value: { status: 'created', skill_id: skill.id, name: skill.name },
    artifacts: [],
  });
  expect(tool.approval).toBe('ask');
});

test('keeps name collisions visible and never retries a write automatically', async () => {
  const { workflow, tool } = fixture();
  workflow.create.mockRejectedValue(new SkillsError('already-installed', 'Name already exists.'));
  const result = await tool.execute({
    input,
    signal: new AbortController().signal,
    turnId: 'turn',
    toolCallId: 'create',
  });
  expect(result.value).toMatchObject({ status: 'error', code: 'already-installed' });
  expect(workflow.create).toHaveBeenCalledTimes(1);
});

test('does not write cancelled or invalid calls', async () => {
  const { workflow, tool } = fixture();
  const controller = new AbortController();
  controller.abort(new Error('Stopped'));
  await expect(
    tool.execute({ input, signal: controller.signal, turnId: 'turn', toolCallId: 'create' }),
  ).rejects.toThrow('Stopped');
  await tool.execute({
    input: { ...input, name: '../notes' },
    signal: new AbortController().signal,
    turnId: 'turn',
    toolCallId: 'create',
  });
  expect(workflow.create).not.toHaveBeenCalled();
});
