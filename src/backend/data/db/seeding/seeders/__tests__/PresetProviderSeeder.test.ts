import type { DbService } from '@/backend/data/db/DbService';
import { providerRegistryService } from '@/backend/data/services/ProviderRegistryService';
import { batchUpsertProviders } from '@/backend/data/services/ProviderService';

import { PresetProviderSeeder } from '../PresetProviderSeeder';

jest.mock('@/backend/data/services/presetProviders', () => ({
  createPresetProviderInput: jest.fn((provider: { id: string; name: string }) => ({
    name: provider.name,
    providerId: provider.id,
  })),
  isRecommendedPresetProvider: jest.fn((providerId: string) => providerId === 'recommended'),
}));
jest.mock('@/backend/data/services/ProviderRegistryService', () => ({
  providerRegistryService: {
    getProvidersVersion: jest.fn(() => 'test-version'),
    loadProviders: jest.fn(() => [
      { id: 'recommended', name: 'Recommended' },
      { id: 'optional', name: 'Optional' },
      { id: 'plan', name: 'Plan', presetProviderId: 'recommended' },
    ]),
  },
}));
jest.mock('@/backend/data/services/ProviderService', () => ({
  batchUpsertProviders: jest.fn(async () => undefined),
}));

describe('PresetProviderSeeder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('installs recommended providers through the supplied database transaction', async () => {
    const database = createDbService({});
    await new PresetProviderSeeder().run(database);

    expect(batchUpsertProviders).toHaveBeenCalledWith(database.getDb(), [
      { name: 'Recommended', providerId: 'recommended' },
    ]);
  });

  test('preserves an intentionally empty provider list after the first seed', async () => {
    await new PresetProviderSeeder().run(createDbService({ hasSeedJournal: true }));

    expect(batchUpsertProviders).toHaveBeenCalledWith(expect.anything(), []);
  });

  test('refreshes only providers that remain installed', async () => {
    await new PresetProviderSeeder().run(
      createDbService({
        existingProviders: [{ providerId: 'optional', presetProviderId: 'optional' }],
        hasSeedJournal: true,
      }),
    );

    expect(batchUpsertProviders).toHaveBeenCalledWith(expect.anything(), [
      { name: 'Optional', providerId: 'optional' },
    ]);
    expect(providerRegistryService.loadProviders).toHaveBeenCalledTimes(1);
  });

  test('refreshes copied presets without installing their originals or touching custom providers', async () => {
    await new PresetProviderSeeder().run(
      createDbService({
        existingProviders: [
          { providerId: 'optional-copy', presetProviderId: 'optional' },
          { providerId: 'plan', presetProviderId: 'recommended' },
          { providerId: 'recommended', presetProviderId: null },
          { providerId: 'custom', presetProviderId: null },
          { providerId: 'removed-copy', presetProviderId: 'removed' },
        ],
        hasSeedJournal: true,
      }),
    );

    expect(batchUpsertProviders).toHaveBeenCalledWith(expect.anything(), [
      { name: 'Optional', providerId: 'optional-copy' },
      { name: 'Plan', providerId: 'plan' },
    ]);
  });
});

function createDbService({
  existingProviders = [],
  hasSeedJournal = false,
}: {
  existingProviders?: { providerId: string; presetProviderId: string | null }[];
  hasSeedJournal?: boolean;
}): DbService {
  const db = {
    select: (projection: Record<string, unknown>) => ({
      from: () => {
        if ('providerId' in projection) {
          return Promise.resolve(existingProviders);
        }

        return {
          where: () => ({
            limit: () => Promise.resolve(hasSeedJournal ? [{ key: 'seed:preset-provider' }] : []),
          }),
        };
      },
    }),
  };

  return {
    getDb: () => db,
    withWriteTx: (callback: (tx: unknown) => Promise<void>) => callback(db),
  } as unknown as DbService;
}
