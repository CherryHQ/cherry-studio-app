import type { SkillListEntry } from '@/backend/data/services/AgentGlobalSkillService';

import type { RuntimeToolCall } from '../../../runtime';
import { createSkillInventoryTool } from '../skillInventoryTool';

function entry(name: string, isEnabled: boolean, bound: boolean | null): SkillListEntry {
  return {
    skill: {
      id: name,
      name,
      description: `About ${name}`,
      version: null,
      isEnabled,
      invocation: { modelInvocable: false, userInvocable: true },
      folderName: 'private-package-path',
      contentHash: 'private-hash',
      manifest: [],
      source: 'marketplace',
      sourceUrl: null,
      author: null,
      tags: [],
      profile: { declaredTools: [] },
      createdAt: '',
      updatedAt: '',
    },
    binding:
      bound === null
        ? null
        : {
            agentId: 'current',
            skillId: name,
            isEnabled: bound,
            createdAt: '',
            updatedAt: '',
          },
  };
}

const call: RuntimeToolCall = {
  input: {},
  signal: new AbortController().signal,
  toolCallId: 'list',
  turnId: 'turn',
};

it('lists unbound and disabled installed Skills without exposing package paths or granting instructions', async () => {
  const list = jest.fn(async () => ({
    items: [
      entry('unbound', true, null),
      entry('global-off', false, true),
      entry('agent-off', true, false),
    ],
    nextCursor: 'next-page',
  }));
  const result = await createSkillInventoryTool({ list }, 'current').execute(call);
  expect(list).toHaveBeenCalledWith({ scope: 'library', agentId: 'current', limit: 50 });
  expect(result.value).toMatchObject({
    returned: 3,
    nextCursor: 'next-page',
    skills: [
      { skill_id: 'unbound', agentBinding: 'unbound' },
      { skill_id: 'global-off', globallyEnabled: false, agentBinding: 'enabled' },
      { skill_id: 'agent-off', agentBinding: 'disabled' },
    ],
  });
  expect(JSON.stringify(result)).not.toContain('private-');
  expect(result.instructions).toBeUndefined();
  expect(result.artifacts).toEqual([]);
});

it('preserves pagination and search, and does not claim Agent binding state without an Agent', async () => {
  const list = jest.fn(async () => ({ items: [entry('notes', true, null)] }));
  const result = await createSkillInventoryTool({ list }).execute({
    ...call,
    input: { search: 'notes', cursor: 'previous', limit: 1 },
  });
  expect(list).toHaveBeenCalledWith({
    scope: 'library',
    agentId: undefined,
    search: 'notes',
    cursor: 'previous',
    limit: 1,
  });
  expect(result.value).toMatchObject({ skills: [{ agentBinding: null }], nextCursor: null });
});

it('rejects invalid bounds and cancellation before querying the library', async () => {
  const list = jest.fn();
  const tool = createSkillInventoryTool({ list });
  await expect(tool.execute({ ...call, input: { limit: 101 } })).rejects.toThrow();
  const controller = new AbortController();
  controller.abort();
  await expect(tool.execute({ ...call, signal: controller.signal })).rejects.toThrow();
  expect(list).not.toHaveBeenCalled();
});
