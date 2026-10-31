import { DatabaseSync } from 'node:sqlite';

import { eq } from 'drizzle-orm';

import { userModelTable, userProviderTable } from '@/backend/data/db/schemas';
import { createTestDb, type TestDb } from '@/backend/data/services/__tests__/_testDb';
import { installProviderRegistryTestSnapshot } from '@/backend/data/services/providerRegistryTestSnapshot';
import { CLOUD_PROVIDER_ID } from '@/shared/contracts/cloud';

import { projectCloudModels } from '../projectCloudModels';
import { cloudSnapshot } from './cloudFixtures';

let db: TestDb;
beforeEach(() => {
  installProviderRegistryTestSnapshot();
  db = createTestDb(new DatabaseSync(':memory:'));
});
afterEach(() => db.sqlite.close());

test('sign-out withdraws the managed catalog while retaining historical model identities and user providers', async () => {
  await db.database
    .insert(userProviderTable)
    .values({ providerId: 'personal', name: 'My provider', isEnabled: true, orderKey: 'a0' });
  await db.dbService.withWriteTx((tx) =>
    projectCloudModels(tx, 'https://cloud.example', cloudSnapshot().models, () => {}),
  );
  const [before] = await db.database
    .select()
    .from(userModelTable)
    .where(eq(userModelTable.providerId, CLOUD_PROVIDER_ID));
  await db.dbService.withWriteTx((tx) =>
    projectCloudModels(tx, 'https://cloud.example', [], () => {}),
  );
  const [after] = await db.database
    .select()
    .from(userModelTable)
    .where(eq(userModelTable.id, before.id));
  expect(after).toMatchObject({
    id: before.id,
    name: before.name,
    isEnabled: false,
    isHidden: true,
  });
  expect(
    await db.database
      .select()
      .from(userProviderTable)
      .where(eq(userProviderTable.providerId, 'personal')),
  ).toEqual([expect.objectContaining({ isEnabled: true })]);
  const [provider] = await db.database
    .select()
    .from(userProviderTable)
    .where(eq(userProviderTable.providerId, CLOUD_PROVIDER_ID));
  expect(provider).toMatchObject({ isEnabled: false, apiKeys: [] });
});

test('a revoked generation rolls back its catalog writes', async () => {
  let checks = 0;
  await expect(
    db.dbService.withWriteTx((tx) =>
      projectCloudModels(tx, 'https://cloud.example', cloudSnapshot().models, () => {
        if (++checks >= 2) throw new Error('account changed');
      }),
    ),
  ).rejects.toThrow('account changed');
  expect(await db.database.select().from(userProviderTable)).toEqual([]);
});
