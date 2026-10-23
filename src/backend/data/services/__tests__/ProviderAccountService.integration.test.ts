import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { eq } from 'drizzle-orm';

import { userProviderTable } from '@/backend/data/db/schemas';
import { LOCAL_PROFILE, setActiveProfile } from '@/shared/data/activeProfile';

import { ProviderAccountService } from '../ProviderAccountService';
import { createTestDb, type TestDb } from './_testDb';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));
let db: TestDb;
let service: ProviderAccountService;
beforeEach(() => {
  setActiveProfile(LOCAL_PROFILE);
  db = createTestDb(new DatabaseSync(':memory:'));
  service = new ProviderAccountService(db.dbService);
});
afterEach(() => {
  setActiveProfile(LOCAL_PROFILE);
  db.sqlite.close();
});

it('does not replace enterprise provider keys through the account authorization writer', async () => {
  const keys = [{ id: 'managed', key: 'organization-key', isEnabled: true }];
  const [row] = await db.database
    .insert(userProviderTable)
    .values({ providerId: 'cherryin', name: 'Organization', orderKey: 'a0', apiKeys: keys })
    .returning();
  setActiveProfile({
    id: 'enterprise',
    address: 'https://enterprise.example',
    identity: { authentication: 'password', deployment: 'server', subject: 'user' },
  });

  await expect(
    service.replaceKeys('cherryin', row!.createdAt, keys, [
      { id: 'account', key: 'user-account-key', isEnabled: true },
    ]),
  ).rejects.toMatchObject({ code: 'INVALID_OPERATION' });
  expect((await db.database.select().from(userProviderTable))[0]?.apiKeys).toEqual(keys);
});

it('removes only unchanged account-owned keys and keeps manual changes and imported duplicates', async () => {
  const owned = { id: 'account', key: 'account-key', isEnabled: true };
  const edited = { id: 'edited', key: 'manual-replacement', isEnabled: true };
  const imported = { id: 'desktop', key: 'shared-key', isEnabled: false };
  const [row] = await db.database
    .insert(userProviderTable)
    .values({
      providerId: 'cherryin',
      name: 'CherryIN',
      orderKey: 'a0',
      apiKeys: [owned, edited, imported],
    })
    .returning();
  await service.replaceKeys(
    'cherryin',
    row!.createdAt,
    [owned, { ...edited, key: 'old-account-key' }],
    [{ id: 'new-account', key: imported.key, isEnabled: true }],
  );
  const [updated] = await db.database.select().from(userProviderTable);
  expect(updated?.apiKeys).toEqual([edited, imported]);
});

it('does not attach a removed provider’s account keys to a replacement row', async () => {
  const [row] = await db.database
    .insert(userProviderTable)
    .values({
      providerId: 'cherryin',
      name: 'CherryIN',
      orderKey: 'a0',
      apiKeys: [],
    })
    .returning();
  const identity = await service.get('cherryin');
  await db.database.delete(userProviderTable).where(eq(userProviderTable.providerId, 'cherryin'));
  jest.spyOn(Date, 'now').mockReturnValue(row!.createdAt + 1000);
  try {
    await db.database
      .insert(userProviderTable)
      .values({ providerId: 'cherryin', name: 'New', orderKey: 'a0' });
    expect(
      await service.replaceKeys(
        'cherryin',
        identity.createdAt,
        [],
        [{ id: 'late', key: 'late-key', isEnabled: true }],
      ),
    ).toBe(false);
    expect((await db.database.select().from(userProviderTable))[0]?.apiKeys).toEqual([]);
  } finally {
    jest.restoreAllMocks();
  }
});
