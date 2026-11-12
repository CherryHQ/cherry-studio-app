import type { MemoryStorage } from '../createAgentMemory';
import { migrateAgentInstructions } from '../migrateAgentInstructions';

const A = '10000000-0000-4000-8000-000000000001';
const B = '10000000-0000-4000-8000-000000000002';

function fixture() {
  const agents = [
    { id: A, instructions: '  Keep my exact persona.\r\n' + '中'.repeat(14_000) },
    { id: B, instructions: '' },
  ];
  const files = new Map<string, string>();
  const storage: MemoryStorage = {
    read: async (id, key) => files.get(`${id}/${key}`) ?? null,
    replace: async (id, key, content) => {
      files.set(`${id}/${key}`, content);
    },
  };
  const clear = async (id: string, source: string) => {
    const agent = agents.find((entry) => entry.id === id)!;
    expect(files.get(`${id}/soul`)).toBe(source);
    agent.instructions = '';
  };
  return { agents, files, storage, clear };
}

test('moves non-empty instructions verbatim and leaves an empty Agent without a SOUL file', async () => {
  const f = fixture();
  const original = f.agents[0].instructions;
  await migrateAgentInstructions(f);
  expect(f.files.get(`${A}/soul`)).toBe(original);
  expect(f.files.has(`${B}/soul`)).toBe(false);
  expect(f.agents.map(({ instructions }) => instructions)).toEqual(['', '']);
  f.files.set(`${A}/soul`, 'A later persona edit');
  await migrateAgentInstructions(f);
  expect(f.files.get(`${A}/soul`)).toBe('A later persona edit');
});

test('retains the legacy source when publication fails and can complete after retry', async () => {
  const f = fixture();
  const original = f.agents[0].instructions;
  await expect(
    migrateAgentInstructions({
      ...f,
      storage: {
        ...f.storage,
        replace: async () => {
          throw new Error('Disk full');
        },
      },
    }),
  ).rejects.toThrow('Disk full');
  expect(f.agents[0].instructions).toBe(original);
  expect(f.files.size).toBe(0);
  await migrateAgentInstructions(f);
  expect(f.files.get(`${A}/soul`)).toBe(original);
  expect(f.agents[0].instructions).toBe('');
});

test('does not clear the source when the published content cannot be confirmed', async () => {
  const f = fixture();
  const original = f.agents[0].instructions;
  await expect(
    migrateAgentInstructions({
      ...f,
      storage: { ...f.storage, read: async () => 'An incomplete write' },
    }),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(f.agents[0].instructions).toBe(original);
});

test('keeps the source if shutdown aborts after publishing but before clearing', async () => {
  const f = fixture();
  const original = f.agents[0].instructions;
  const controller = new AbortController();
  await expect(
    migrateAgentInstructions({
      ...f,
      signal: controller.signal,
      storage: {
        ...f.storage,
        read: async () => {
          controller.abort();
          return original;
        },
      },
    }),
  ).rejects.toThrow();
  expect(f.agents[0].instructions).toBe(original);
  expect(f.files.get(`${A}/soul`)).toBe(original);
});
