import { createAgentMemory } from '@/backend/services/agentMemory/createAgentMemory';
import { memoryContext } from '@/backend/services/agentMemory/memoryContext';

import type { RuntimeJsonValue } from '../../runtime';
import { createMemoryTools } from '../memoryTools';

const ID = '10000000-0000-4000-8000-000000000001';

function fixture() {
  const files = new Map<string, string>();
  let completed: boolean | null = false;
  let failStateWrite = false;
  const memory = createAgentMemory({
    bootstrap: {
      read: async () => completed,
      write: async (_id, value) => {
        if (failStateWrite) throw new Error('Database unavailable');
        completed = value;
      },
    },
    storage: {
      read: async (_id, key) => files.get(key) ?? null,
      replace: async (_id, key, content) => {
        files.set(key, content);
      },
    },
    assertAgent: async () => {},
    assertWritable: () => {},
  });
  const tools = createMemoryTools(memory, ID);
  return {
    memory,
    files,
    tools,
    failStateWrite: () => {
      failStateWrite = true;
    },
    invoke(name: string, input: RuntimeJsonValue, signal = new AbortController().signal) {
      return tools
        .find((entry) => entry.providerName === name)!
        .execute({
          input,
          signal,
          toolCallId: 'call-1',
          turnId: 'turn-1',
        });
    },
  };
}

test('skipping removes current onboarding without editing identity or requesting approval', async () => {
  const f = fixture();
  const tool = f.tools.find((entry) => entry.providerName === 'memory_bootstrap')!;
  expect(tool).toMatchObject({ approval: 'auto', effect: 'write' });
  const result = await f.invoke('memory_bootstrap', { action: 'complete' });
  expect(result.failure).toBeUndefined();
  expect(result.value).toEqual({ bootstrapCompleted: true });
  expect(result.instructions?.text).not.toContain('## Bootstrap Mode');
  expect(f.files.size).toBe(0);
  const edited = await f.invoke('memory_update', {
    key: 'user',
    content: 'Prefer Chinese',
    expected_version: 'missing',
  });
  expect(edited.instructions?.text).toContain('Prefer Chinese');
  expect(edited.instructions?.text).not.toContain('## Bootstrap Mode');
});

test('explicit restart preserves the persona and enables guidance on the next prepared turn', async () => {
  const f = fixture();
  await f.invoke('memory_update', {
    key: 'soul',
    content: 'An established persona '.repeat(10),
    expected_version: 'missing',
  });
  await f.invoke('memory_bootstrap', { action: 'complete' });
  const reset = await f.invoke('memory_bootstrap', { action: 'reset' });
  expect(reset.value).toEqual({ bootstrapCompleted: false });
  expect(reset.instructions?.text).not.toContain('## Bootstrap Mode');
  const next = memoryContext(await f.memory.snapshot(ID), true);
  expect(next.text).toContain('## Bootstrap Mode');
  expect(next.text).toContain('An established persona');
});

test('failed and invalid completion writes do not claim success or change setup state', async () => {
  const f = fixture();
  expect(
    await f.invoke('memory_bootstrap', { action: 'complete', agent_id: 'another-agent' }),
  ).toHaveProperty('failure');
  f.failStateWrite();
  const failed = await f.invoke('memory_bootstrap', { action: 'complete' });
  expect(failed).toHaveProperty('failure');
  expect(failed.instructions).toBeUndefined();
  expect((await f.memory.snapshot(ID)).bootstrapCompleted).toBe(false);
  expect(f.files.size).toBe(0);
});
