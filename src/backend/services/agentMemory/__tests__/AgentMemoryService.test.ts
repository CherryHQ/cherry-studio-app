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
