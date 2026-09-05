import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { paintingTable } from '@/backend/data/db/schemas/painting';

import { paintingService } from '../PaintingService';
import { createTestDb, type TestDb } from './_testDb';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

describe('writes against a deleted resource', () => {
  let sqlite: DatabaseSync;
  let db: TestDb;

  beforeEach(async () => {
    sqlite = new DatabaseSync(':memory:');
    db = createTestDb(sqlite);
    await installTestHost({ DbService: db.dbService });
  });

  afterEach(async () => {
    await uninstallTestHost();
    sqlite.close();
  });

  it('refuses to persist generated outputs onto a deleted painting receipt', async () => {
    const painting = await paintingService.create({
      modelId: 'openai::image-1',
      prompt: 'draw',
      providerId: 'openai',
    });
    await paintingService.deleteMany([painting.id]);

    await expect(paintingService.replaceOutputs(painting.id, [])).rejects.toThrow();
    expect(await db.database.select().from(paintingTable)).toHaveLength(0);
  });
});
