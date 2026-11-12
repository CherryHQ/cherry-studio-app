import type { AgentService } from '@/backend/data/services/AgentService';
import { createAgentMemory } from '@/backend/services/agentMemory/createAgentMemory';
import type { Agent } from '@/shared/data/types/agent';

import { createAgentProfiles } from '../createAgentProfiles';

const ID = '10000000-0000-4000-8000-000000000001';
const AGENT: Agent = {
  id: ID,
  name: 'Writer',
  instructions: '',
  mode: 'standard',
  model: null,
  modelName: null,
  avatar: null,
  avatarUri: null,
  disabledCapabilities: [],
  toolApprovalMode: 'auto',
  orderKey: 'a0',
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

function fixture() {
  const files = new Map<string, string>();
  let storageFailed = false;
  let row: Agent | null = null;
  const memory = createAgentMemory({
    storage: {
      read: async (id, key) => files.get(`${id}/${key}`) ?? null,
      replace: async (id, key, text) => {
        if (storageFailed) throw new Error('Storage unavailable');
        files.set(`${id}/${key}`, text);
      },
    },
    assertAgent: async () => {
      if (!row) throw new Error('Deleted Agent');
    },
    assertWritable: () => {},
  });
  const data: Pick<AgentService, 'create' | 'delete' | 'getById' | 'list' | 'update'> = {
    create: async (input) => {
      row = { ...AGENT, ...input };
      return row;
    },
    delete: async () => {
      row = null;
      return { deleted: true };
    },
    getById: async () => row!,
    list: async () => ({ items: row ? [row] : [], page: 1, total: row ? 1 : 0 }),
    update: async (_id, input) => {
      row = { ...row!, ...input };
      return row;
    },
  };
  return {
    profiles: createAgentProfiles(data, memory),
    memory,
    files,
    row: () => row,
    failStorage: () => {
      storageFailed = true;
    },
  };
}

test('creates a SOUL-backed profile without storing persona in Agent metadata', async () => {
  const f = fixture();
  const content = 'Keep my complete role.\n' + 'x'.repeat(16_000);
  const created = await f.profiles.create(
    { name: 'Writer', instructions: content },
    'Prefer Chinese',
  );
  expect(created.instructions).toBe(content);
  expect(created.instructionsVersion).toBe((await f.memory.read(ID, 'soul')).version);
  expect(f.row()?.instructions).toBe('');
  expect((await f.memory.read(ID, 'user')).content).toBe('Prefer Chinese');
  expect((await f.profiles.list()).items[0].instructions).toBe(content);
});

test('rejects an editor draft superseded by a memory write without changing other fields', async () => {
  const f = fixture();
  const original = await f.profiles.create({ name: 'Writer', instructions: 'Original' });
  await f.memory.write({
    agentId: ID,
    key: 'soul',
    content: 'Changed in conversation',
    expectedVersion: original.instructionsVersion!,
  });
  await expect(
    f.profiles.update(ID, {
      name: 'Stale name',
      instructions: 'Old editor draft',
      expectedInstructionsVersion: original.instructionsVersion,
    }),
  ).rejects.toMatchObject({ code: 'conflict' });
  expect((await f.profiles.getById(ID)).instructions).toBe('Changed in conversation');
  expect(f.row()?.name).toBe('Writer');
});

test('clearing SOUL remains cleared without changing USER or restoring the legacy field', async () => {
  const f = fixture();
  const original = await f.profiles.create(
    { name: 'Writer', instructions: 'Role' },
    'User background',
  );
  await f.profiles.update(ID, {
    instructions: '',
    expectedInstructionsVersion: original.instructionsVersion,
  });
  expect((await f.profiles.getById(ID)).instructions).toBe('');
  expect((await f.memory.read(ID, 'user')).content).toBe('User background');
  expect(f.row()?.instructions).toBe('');
});

test('does not leave a newly created Agent selectable if its initial identity cannot be saved', async () => {
  const f = fixture();
  await expect(
    f.profiles.create({ name: 'Writer', instructions: '中'.repeat(400_000) }),
  ).rejects.toMatchObject({ code: 'too-large' });
  expect((await f.profiles.list()).total).toBe(0);
});

test('removes a provisional definition after file publication fails', async () => {
  const f = fixture();
  f.failStorage();
  await expect(
    f.profiles.create({ name: 'Writer', instructions: 'A valid persona' }),
  ).rejects.toThrow('Storage unavailable');
  expect((await f.profiles.list()).total).toBe(0);
  expect(f.files.size).toBe(0);
});
