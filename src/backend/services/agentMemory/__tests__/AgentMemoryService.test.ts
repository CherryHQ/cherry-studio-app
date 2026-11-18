import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { createTestDb } from '@/backend/data/services/__tests__/_testDb';

import { AgentMemoryService } from '../AgentMemoryService';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

jest.mock('../memoryStorage', () => ({
  memoryStorage: { read: async () => null, replace: async () => {} },
}));

const ID = '10000000-0000-4000-8000-000000000001';

test('setup state survives memory service replacement and a failed transaction retains the committed value', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const { dbService, failWriteTxCommit } = createTestDb(sqlite);
    sqlite
      .prepare(
        'INSERT INTO agent (id, name, order_key, created_at, updated_at) VALUES (?, ?, ?, 1, 1)',
      )
      .run(ID, 'Writer', 'a0');
    const first = new AgentMemoryService(dbService);
    await first.operations.setBootstrapCompleted(ID, true);
    const restored = new AgentMemoryService(dbService);
    expect((await restored.operations.snapshot(ID)).bootstrapCompleted).toBe(true);
    failWriteTxCommit(new Error('Commit failed'));
    await expect(restored.operations.setBootstrapCompleted(ID, false)).rejects.toThrow(
      'Commit failed',
    );
    expect((await restored.operations.snapshot(ID)).bootstrapCompleted).toBe(true);
    expect(sqlite.prepare('SELECT name, instructions FROM agent').get()).toEqual({
      name: 'Writer',
      instructions: '',
    });
    await restored.operations.setBootstrapCompleted(ID, false);
    expect(
      (await new AgentMemoryService(dbService).operations.snapshot(ID)).bootstrapCompleted,
    ).toBe(false);
  } finally {
    sqlite.close();
  }
});

test('keeps managed instructions on the server-owned row and refreshes them without local identity tools', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const { dbService } = createTestDb(sqlite);
    sqlite
      .prepare(
        'INSERT INTO agent (id, name, instructions, managed_remote_id, order_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1)',
      )
      .run(ID, 'Organization writer', 'Server role', 'remote-agent', 'a0');
    const service = new AgentMemoryService(dbService);
    await service._doInit();
    expect(sqlite.prepare('SELECT instructions FROM agent WHERE id = ?').get(ID)).toEqual({
      instructions: 'Server role',
    });
    expect(await service.soul(ID)).toBe('Server role');
    expect((await service.context(ID, undefined, true)).text).toContain('Server role');
    sqlite.prepare('UPDATE agent SET instructions = ? WHERE id = ?').run('New server role', ID);
    expect((await service.context(ID)).text).toContain('New server role');
    await expect(service.operations.read(ID, 'soul')).rejects.toMatchObject({
      code: 'unavailable',
    });
    await expect(
      service.operations.write({
        agentId: ID,
        key: 'soul',
        content: 'Local override',
        expectedVersion: 'missing',
      }),
    ).rejects.toMatchObject({ code: 'unavailable' });
    await expect(service.operations.setBootstrapCompleted(ID, false)).rejects.toMatchObject({
      code: 'unavailable',
    });
  } finally {
    sqlite.close();
  }
});
