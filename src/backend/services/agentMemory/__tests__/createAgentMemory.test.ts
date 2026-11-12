import { createAgentMemory } from '../createAgentMemory';
import { memoryContext } from '../memoryContext';
import { AGENT_MEMORY_DOCUMENT_BYTES, AgentMemoryError } from '../memoryTypes';

const A = '10000000-0000-4000-8000-000000000001';
const B = '10000000-0000-4000-8000-000000000002';

function fixture() {
  const files = new Map<string, string>();
  let writable = true;
  let available = true;
  const memory = createAgentMemory({
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

test('rejects the second of two fact replacements based on the same revision', async () => {
  const { memory } = fixture();
  const writes = await Promise.allSettled(
    ['Keep decision A', 'Keep decision B'].map((content) =>
      memory.write({ agentId: A, key: 'fact', content, expectedVersion: 'missing' }),
    ),
  );
  expect(writes[0].status).toBe('fulfilled');
  expect(writes[1]).toMatchObject({ status: 'rejected', reason: { code: 'conflict' } });
  expect((await memory.snapshot(A)).fact.content).toBe('Keep decision A');
});

test('serializes journal appends and searches recent matches without confusing facts with events', async () => {
  const { memory } = fixture();
  await Promise.all(
    ['Build completed', 'Deploy completed', 'Meeting completed'].map((text) =>
      memory.append(A, text, ['Work']),
    ),
  );
  await memory.write({
    agentId: A,
    key: 'fact',
    content: 'Unrelated permanent fact',
    expectedVersion: 'missing',
  });
  expect(
    (await memory.search(A, { query: 'COMPLETED', tag: 'work', limit: 2 })).map(
      (entry) => entry.text,
    ),
  ).toEqual(['Meeting completed', 'Deploy completed']);
  expect(await memory.search(B, {})).toEqual([]);
  expect(await memory.search(A, { query: 'permanent fact' })).toEqual([]);
});

test('ignores damaged journal lines without losing valid earlier events', async () => {
  const { memory, files } = fixture();
  await memory.append(A, 'Earlier event', []);
  files.set(`${A}/journal`, files.get(`${A}/journal`)! + '{partial\n{"text":"wrong shape"}\n');
  expect((await memory.search(A, {})).map((entry) => entry.text)).toEqual(['Earlier event']);
});

test('enforces UTF-8 size before replacing a document and rejects a journal replacement', async () => {
  const { memory } = fixture();
  await expect(
    memory.write({
      agentId: A,
      key: 'fact',
      content: '中'.repeat(AGENT_MEMORY_DOCUMENT_BYTES / 2),
      expectedVersion: 'missing',
    }),
  ).rejects.toMatchObject({ code: 'too-large' });
  expect((await memory.snapshot(A)).fact.version).toBe('missing');
  await expect(async () =>
    memory.write({
      agentId: A,
      key: 'journal' as 'fact',
      content: 'erase',
      expectedVersion: 'missing',
    }),
  ).rejects.toThrow();
});

test('separates a new event from an interrupted final journal line', async () => {
  const { memory, files } = fixture();
  files.set(`${A}/journal`, '{unfinished');
  await memory.append(A, 'New valid event', []);
  expect((await memory.search(A, {})).map((entry) => entry.text)).toEqual(['New valid event']);
});

test('refuses writes while storage is frozen, after deletion, and after its owner closes', async () => {
  const frozen = fixture();
  frozen.freeze();
  expect(() =>
    frozen.memory.write({
      agentId: A,
      key: 'fact',
      content: 'x',
      expectedVersion: 'missing',
    }),
  ).toThrow();
  expect((await frozen.memory.snapshot(A)).fact.content).toBe('');
  const removed = fixture();
  removed.removeAgent();
  await expect(removed.memory.snapshot(A)).rejects.toMatchObject({ code: 'agent-unavailable' });
  const closed = fixture();
  await closed.memory.close();
  await expect(closed.memory.snapshot(A)).rejects.toMatchObject({ code: 'unavailable' });
});

test('withdraws unreadable memory without preventing the next conversation turn', async () => {
  const memory = createAgentMemory({
    storage: {
      read: async () => {
        throw new Error('Storage read failed');
      },
      replace: async () => {},
    },
    assertAgent: async () => {},
    assertWritable: () => {},
  });
  expect((await memory.snapshot(A)).fact).toEqual({
    key: 'fact',
    content: '',
    version: 'unavailable',
    truncated: false,
  });
  await expect(memory.read(A, 'fact')).rejects.toThrow('Storage read failed');
});

test('bounds escaped identity context and requires a full read before replacing a preview', async () => {
  const { memory } = fixture();
  await memory.write({
    agentId: A,
    key: 'fact',
    content: '<'.repeat(12_000),
    expectedVersion: 'missing',
  });
  const context = memoryContext(await memory.snapshot(A));
  expect(context.text.length).toBeLessThan(22_000);
  const data = JSON.parse(context.text.split('<agent_memory>\n')[1].split('\n</agent_memory>')[0]);
  expect(data.fact).toMatchObject({ truncated: true, version: 'read-required' });
  await expect(
    memory.write({
      agentId: A,
      key: 'fact',
      content: 'Replace the preview',
      expectedVersion: data.fact.version,
    }),
  ).rejects.toMatchObject({ code: 'conflict' });
  expect((await memory.read(A, 'fact')).content).toBe('<'.repeat(12_000));
});
