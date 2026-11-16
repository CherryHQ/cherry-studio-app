import {
  encodeSkillCursor,
  type SkillListEntry,
} from '@/backend/data/services/AgentGlobalSkillService';
import type { ListSkillsQueryParams } from '@/shared/data/api/schemas/skills';

import type { RuntimeToolCall } from '../../../runtime';
import { createSkillInventoryTool, SKILL_INVENTORY_MAX_CHARACTERS } from '../skillInventoryTool';

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
  const result = await createSkillInventoryTool(
    { list, countLibrary: jest.fn() },
    'current',
  ).execute(call);
  expect(list).toHaveBeenCalledWith({
    scope: 'library',
    agentId: 'current',
    limit: 20,
    search: undefined,
    cursor: undefined,
  });
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
  expect(JSON.stringify(result)).not.toContain('description');
  expect(JSON.stringify(result)).not.toContain('version');
  expect(result.instructions).toBeUndefined();
  expect(result.artifacts).toEqual([]);
});

it('preserves pagination and search, and does not claim Agent binding state without an Agent', async () => {
  const list = jest.fn(async () => ({ items: [entry('notes', true, null)] }));
  const result = await createSkillInventoryTool({ list, countLibrary: jest.fn() }).execute({
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

it('counts the filtered library without reading entries or following pages', async () => {
  const list = jest.fn();
  const countLibrary = jest.fn(async () => 12_345);
  const result = await createSkillInventoryTool({ list, countLibrary }).execute({
    ...call,
    input: { mode: 'count', search: ' notes ' },
  });
  expect(result.value).toEqual({ total: 12_345 });
  expect(countLibrary).toHaveBeenCalledWith('notes');
  expect(list).not.toHaveBeenCalled();
});

it.each([
  { label: 'compact', includeDescriptions: false, description: '界'.repeat(1024) },
  { label: 'descriptions', includeDescriptions: true, description: '界'.repeat(1024) },
  { label: 'JSON escaping', includeDescriptions: true, description: '\u0001'.repeat(1024) },
])(
  'bounds $label pages without skipping or truncating entries',
  async ({ includeDescriptions, description }) => {
    const entries = Array.from({ length: 100 }, (_, index) => {
      const item = entry(`skill-${String(index).padStart(3, '0')}`, true, null);
      item.skill.description = description;
      return item;
    });
    const list = jest.fn(async ({ cursor, limit = 20 }: ListSkillsQueryParams) => {
      const start = cursor
        ? entries.findIndex(({ skill }) => encodeSkillCursor(skill) === cursor) + 1
        : 0;
      const items = entries.slice(start, start + Number(limit));
      return {
        items,
        nextCursor:
          start + items.length < entries.length
            ? encodeSkillCursor(items[items.length - 1].skill)
            : undefined,
      };
    });
    const tool = createSkillInventoryTool({ list, countLibrary: jest.fn() });
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < entries.length; page++) {
      const result = await tool.execute({
        ...call,
        input: { limit: 100, include_descriptions: includeDescriptions, cursor },
      });
      const value = result.value as {
        returned: number;
        skills: { skill_id: string; description?: string }[];
        nextCursor: string | null;
      };
      expect(JSON.stringify(value).length).toBeLessThanOrEqual(SKILL_INVENTORY_MAX_CHARACTERS);
      expect(value.returned).toBeGreaterThan(0);
      expect(value.returned).toBe(value.skills.length);
      for (const item of value.skills) {
        expect(item.description).toBe(includeDescriptions ? description : undefined);
        seen.push(item.skill_id);
      }
      if (value.nextCursor === null) break;
      cursor = value.nextCursor;
    }
    expect(list.mock.calls.length).toBeGreaterThan(1);
    expect(seen).toEqual(entries.map(({ skill }) => skill.id));
  },
);

it('rejects invalid bounds and cancellation before querying the library', async () => {
  const list = jest.fn();
  const countLibrary = jest.fn();
  const tool = createSkillInventoryTool({ list, countLibrary });
  await expect(tool.execute({ ...call, input: { limit: 101 } })).rejects.toThrow();
  const controller = new AbortController();
  controller.abort();
  await expect(tool.execute({ ...call, signal: controller.signal })).rejects.toThrow();
  await expect(
    tool.execute({ ...call, input: { mode: 'count' }, signal: controller.signal }),
  ).rejects.toThrow();
  expect(list).not.toHaveBeenCalled();
  expect(countLibrary).not.toHaveBeenCalled();
});
