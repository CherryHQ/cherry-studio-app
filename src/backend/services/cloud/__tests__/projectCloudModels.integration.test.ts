import { DatabaseSync } from 'node:sqlite';

import { eq } from 'drizzle-orm';

import { userModelTable, userProviderTable } from '@/backend/data/db/schemas';
import { cloudProviderSeed } from '@/backend/data/db/seeding/seeders/cloudProviderSeed';
import { SeedRunner } from '@/backend/data/db/seeding/SeedRunner';
import { createTestDb, type TestDb } from '@/backend/data/services/__tests__/_testDb';
import { installProviderRegistryTestSnapshot } from '@/backend/data/services/providerRegistryTestSnapshot';
import { CLOUD_PROVIDER_ID } from '@/shared/contracts/cloud';

import { projectCloudModels } from '../projectCloudModels';
import { cloudSnapshot } from './_cloudFixtures';

let db: TestDb;
beforeEach(() => {
  installProviderRegistryTestSnapshot();
  db = createTestDb(new DatabaseSync(':memory:'));
});
afterEach(() => db.sqlite.close());

test('sign-out withdraws the managed catalog while retaining historical model identities and user providers', async () => {
  await new SeedRunner(db.dbService).runAll([cloudProviderSeed]);
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
  await db.dbService.withWriteTx((tx) => projectCloudModels(tx, null, [], () => {}));
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
  expect(provider).toMatchObject({
    isEnabled: true,
    apiKeys: [],
    endpointConfigs: {
      'openai-chat-completions': { baseUrl: 'https://cloud.example' },
    },
  });
});

test('a legacy empty catalog starts enabled and a later opt-out survives sync and startup', async () => {
  const cloud = eq(userProviderTable.providerId, CLOUD_PROVIDER_ID);
  await db.database.insert(userProviderTable).values({
    providerId: CLOUD_PROVIDER_ID,
    name: 'CherryAI',
    isEnabled: false,
    orderKey: 'a2',
  });
  const seeds = new SeedRunner(db.dbService);
  await seeds.runAll([cloudProviderSeed]);
  expect(await db.database.select().from(userProviderTable).where(cloud)).toMatchObject([
    { isEnabled: true, orderKey: 'a2' },
  ]);

  await db.database.update(userProviderTable).set({ isEnabled: false }).where(cloud);
  await db.dbService.withWriteTx((tx) =>
    projectCloudModels(tx, 'https://cloud.example', cloudSnapshot().models, () => {}),
  );
  await seeds.runAll([cloudProviderSeed]);
  expect(await db.database.select().from(userProviderTable).where(cloud)).toMatchObject([
    { isEnabled: false },
  ]);
});

test('a revoked generation rolls back its catalog writes', async () => {
  await new SeedRunner(db.dbService).runAll([cloudProviderSeed]);
  let checks = 0;
  await expect(
    db.dbService.withWriteTx((tx) =>
      projectCloudModels(tx, 'https://cloud.example', cloudSnapshot().models, () => {
        if (++checks >= 2) throw new Error('account changed');
      }),
    ),
  ).rejects.toThrow('account changed');
  expect(await db.database.select().from(userProviderTable)).toMatchObject([
    { endpointConfigs: null },
  ]);
  expect(await db.database.select().from(userModelTable)).toEqual([]);
});
