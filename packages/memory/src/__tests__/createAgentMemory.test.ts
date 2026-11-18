import { createHash } from 'node:crypto';

import { createAgentMemory } from '../createAgentMemory';
import { AGENT_MEMORY_DOCUMENT_BYTES, AgentMemoryError } from '../identityTypes';
import { memoryContext } from '../memoryContext';

const A = '10000000-0000-4000-8000-000000000001';
const B = '10000000-0000-4000-8000-000000000002';

function fixture() {
  const files = new Map<string, string>();
  const bootstrap = new Map<string, boolean>();
  let writable = true;
  let available = true;
  const memory = createAgentMemory({
    hash: (text) => createHash('sha256').update(text).digest('hex'),
    bootstrap: {
      read: async (id) => bootstrap.get(id) ?? null,
      write: async (id, completed) => {
        bootstrap.set(id, completed);
      },
    },
    storage: {
      read: async (id, key) => files.get(`${id}/${key}`) ?? null,
      replace: async (id, key, content) => {
        files.set(`${id}/${key}`, content);
      },
    },
    assertAgent: async () => {
      if (!available) throw new AgentMemoryError('agent-unavailable');
    },
    assertWritable: () => {
      if (!writable) throw new AgentMemoryError('unavailable');
    },
  });
  return {
    memory,
    files,
    freeze: () => {
      writable = false;
    },
    removeAgent: () => {
      available = false;
    },
  };
}

test('keeps identity isolated per Agent across independent readers and clears old context explicitly', async () => {
  const { memory } = fixture();
  const first = await memory.write({
    agentId: A,
    key: 'user',
    content: 'Use Chinese',
    expectedVersion: 'missing',
  });
  expect((await memory.snapshot(A)).user.content).toBe('Use Chinese');
  expect((await memory.snapshot(B)).user.content).toBe('');
  await memory.write({
    agentId: A,
    key: 'user',
    content: '',
    expectedVersion: first.version,
  });
  const context = memoryContext(await memory.snapshot(A));
  expect(context.text).toContain('Empty content withdraws the previous value');
  expect(context.text).not.toContain('Use Chinese');
});

test('rejects the second of two identity replacements based on the same revision', async () => {
  const { memory } = fixture();
  const writes = await Promise.allSettled(
    ['Keep decision A', 'Keep decision B'].map((content) =>
      memory.write({ agentId: A, key: 'user', content, expectedVersion: 'missing' }),
    ),
  );
  expect(writes[0].status).toBe('fulfilled');
  expect(writes[1]).toMatchObject({ status: 'rejected', reason: { code: 'conflict' } });
  expect((await memory.snapshot(A)).user.content).toBe('Keep decision A');
});

test('completion and reset persist per Agent without writing identity files', async () => {
  const { memory, files } = fixture();
  expect((await memory.snapshot(A)).bootstrapCompleted).toBeNull();
  await memory.setBootstrapCompleted(A, true);
  expect((await memory.snapshot(A)).bootstrapCompleted).toBe(true);
  expect((await memory.snapshot(B)).bootstrapCompleted).toBeNull();
  await memory.setBootstrapCompleted(A, false);
  expect((await memory.snapshot(A)).bootstrapCompleted).toBe(false);
  expect(files.size).toBe(0);
});

test('setup-state writes respect backup freeze, deletion and service shutdown', async () => {
  const frozen = fixture();
  frozen.freeze();
  expect(() => frozen.memory.setBootstrapCompleted(A, true)).toThrow();
  expect((await frozen.memory.snapshot(A)).bootstrapCompleted).toBeNull();
  const deleted = fixture();
  deleted.removeAgent();
  await expect(deleted.memory.setBootstrapCompleted(A, true)).rejects.toMatchObject({
    code: 'agent-unavailable',
  });
  const closed = fixture();
  await closed.memory.close();
  await expect(closed.memory.setBootstrapCompleted(A, true)).rejects.toMatchObject({
    code: 'unavailable',
  });
});

test('enforces UTF-8 size before replacing a document and rejects a managed-memory key', async () => {
  const { memory } = fixture();
  await expect(
    memory.write({
      agentId: A,
      key: 'user',
      content: '中'.repeat(AGENT_MEMORY_DOCUMENT_BYTES / 2),
      expectedVersion: 'missing',
    }),
  ).rejects.toMatchObject({ code: 'too-large' });
  expect((await memory.snapshot(A)).user.version).toBe('missing');
  await expect(async () =>
    memory.write({
      agentId: A,
      key: 'memory' as 'user',
      content: 'erase',
      expectedVersion: 'missing',
    }),
  ).rejects.toThrow();
});

test('refuses writes while storage is frozen, after deletion, and after its owner closes', async () => {
  const frozen = fixture();
  frozen.freeze();
  expect(() =>
    frozen.memory.write({
      agentId: A,
      key: 'user',
      content: 'x',
      expectedVersion: 'missing',
    }),
  ).toThrow();
  expect((await frozen.memory.snapshot(A)).user.content).toBe('');
  const removed = fixture();
  removed.removeAgent();
  await expect(removed.memory.snapshot(A)).rejects.toMatchObject({ code: 'agent-unavailable' });
  const closed = fixture();
  await closed.memory.close();
  await expect(closed.memory.snapshot(A)).rejects.toMatchObject({ code: 'unavailable' });
});

test('withdraws unreadable memory without preventing the next conversation turn', async () => {
  const memory = createAgentMemory({
    hash: (text) => createHash('sha256').update(text).digest('hex'),
    bootstrap: { read: async () => null, write: async () => {} },
    storage: {
      read: async () => {
        throw new Error('Storage read failed');
      },
      replace: async () => {},
    },
    assertAgent: async () => {},
    assertWritable: () => {},
  });
  expect((await memory.snapshot(A)).user).toEqual({
    key: 'user',
    content: '',
    version: 'unavailable',
    truncated: false,
  });
  await expect(memory.read(A, 'user')).rejects.toThrow('Storage read failed');
});

test('blocks backup admission during a profile workflow and drains it before closing', async () => {
  const { memory } = fixture();
  let release!: () => void;
  const workflow = memory.withStorageWork(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  expect(memory.hasPendingStorageWork()).toBe(true);
  await Promise.resolve();
  let closed = false;
  const closing = memory.close().then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  release();
  await workflow;
  await closing;
  expect(memory.hasPendingStorageWork()).toBe(false);
  await expect(memory.withStorageWork(async () => {})).rejects.toMatchObject({
    code: 'unavailable',
  });
});

test('keeps complete identity content and write versions while escaping markup', async () => {
  const { memory } = fixture();
  await memory.write({
    agentId: A,
    key: 'user',
    content: '<'.repeat(12_000),
    expectedVersion: 'missing',
  });
  const context = memoryContext(await memory.snapshot(A));
  expect(context.text).not.toContain('<'.repeat(12_000));
  const data = JSON.parse(context.text.split('<agent_memory>\n')[1].split('\n</agent_memory>')[0]);
  expect(data.user).toMatchObject({ truncated: false, content: '<'.repeat(12_000) });
  expect(data.user.version).toBe((await memory.read(A, 'user')).version);
  await memory.write({
    agentId: A,
    key: 'user',
    content: 'A complete replacement',
    expectedVersion: data.user.version,
  });
  expect((await memory.read(A, 'user')).content).toBe('A complete replacement');
});
