import { eq } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import { userProviderTable } from '@/backend/data/db/schemas/userProvider';
import { createServiceTestDatabase } from '@/backend/data/serviceTestDatabase';

import { ProviderCatalogRuntime } from '../ProviderCatalogRuntime';

let database: ReturnType<typeof createServiceTestDatabase>;
let catalog: ProviderCatalogRuntime;
let country: jest.Mock<Promise<string | null>, []>;
let mockDeviceRegion: string | null = 'CN';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'zh-CN', regionCode: mockDeviceRegion }],
}));

beforeEach(async () => {
  mockDeviceRegion = 'CN';
  database = createServiceTestDatabase();
  country = jest.fn(async () => 'CN');
  await installTestHost({ DbService: database.dbService, RegionService: { getCountry: country } }, [
    ProviderCatalogRuntime,
  ]);
  catalog = application.get('ProviderCatalogRuntime');
});
afterEach(async () => {
  await uninstallTestHost();
  database.sqlite.close();
});

test.each([
  { ipCountry: 'CN', deviceRegion: 'US', international: false },
  { ipCountry: 'US', deviceRegion: 'CN', international: true },
  { ipCountry: null, deviceRegion: 'CN', international: false },
  { ipCountry: null, deviceRegion: 'US', international: true },
  { ipCountry: null, deviceRegion: null, international: false },
])(
  'seeds recommendations for IP $ipCountry and device region $deviceRegion',
  async ({ ipCountry, deviceRegion, international }) => {
    country.mockResolvedValue(ipCountry);
    mockDeviceRegion = deviceRegion;
    await catalog.ensureReady();
    const providers = await database.database.select().from(userProviderTable);
    expect(providers.some((provider) => provider.providerId === 'deepseek')).toBe(true);
    for (const id of ['openai', 'anthropic', 'gemini']) {
      expect(providers.some((provider) => provider.providerId === id)).toBe(international);
    }
  },
);

test('shutdown releases catalog admission while the region is waiting for a privacy decision', async () => {
  let requested!: () => void;
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  country.mockImplementation(
    () =>
      new Promise(() => {
        requested();
      }),
  );
  const initialization = catalog.ensureReady();
  const rejected = expect(initialization).rejects.toThrow();
  await started;
  await catalog._doStop();
  await rejected;
  expect(catalog.hasPendingStorageWork()).toBe(false);
  expect(await database.database.select().from(userProviderTable)).toEqual([]);
});

test('a later cold start in China preserves international providers, credentials and disabled choices', async () => {
  country.mockResolvedValue('US');
  await catalog.ensureReady();
  await database.database
    .update(userProviderTable)
    .set({
      name: 'My OpenAI',
      isEnabled: true,
      apiKeys: [{ id: 'saved', key: 'test-key', isEnabled: true }],
    })
    .where(eq(userProviderTable.providerId, 'openai'));
  const before = await database.database.select().from(userProviderTable);
  await uninstallTestHost();
  country.mockClear().mockResolvedValue('CN');
  await installTestHost({ DbService: database.dbService, RegionService: { getCountry: country } }, [
    ProviderCatalogRuntime,
  ]);
  await application.get('ProviderCatalogRuntime').ensureReady();
  expect(await database.database.select().from(userProviderTable)).toEqual(before);
  expect(country).not.toHaveBeenCalled();
});

test('a deliberately emptied provider list is not repopulated after a region change', async () => {
  await catalog.ensureReady();
  await database.database.delete(userProviderTable);
  await uninstallTestHost();
  country.mockResolvedValue('US');
  await installTestHost({ DbService: database.dbService, RegionService: { getCountry: country } }, [
    ProviderCatalogRuntime,
  ]);
  await application.get('ProviderCatalogRuntime').ensureReady();
  expect(await database.database.select().from(userProviderTable)).toEqual([]);
});

test('backup admission sees pending initialization and frozen storage rejects a new seed', async () => {
  const release = storageMutationGate.freeze();
  try {
    expect(() => catalog.ensureReady()).toThrow();
  } finally {
    release();
  }
  let finish!: (value: string) => void;
  let requested!: () => void;
  const reachedCountry = new Promise<void>((resolve) => {
    requested = resolve;
  });
  country.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
        requested();
      }),
  );
  const initializing = catalog.ensureReady();
  expect(catalog.hasPendingStorageWork()).toBe(true);
  await reachedCountry;
  finish('CN');
  await initializing;
  expect(catalog.hasPendingStorageWork()).toBe(false);
  expect((await database.database.select().from(userProviderTable)).length).toBeGreaterThan(0);
});
