import type { DbService } from '@/backend/data/db/DbService';
import { providerRegistryService } from '@/backend/data/services/ProviderRegistryService';
import { providerService } from '@/backend/data/services/ProviderService';

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
  providerService: {
    batchUpsert: jest.fn(async () => undefined),
  },
}));

describe('PresetProviderSeeder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('installs recommended providers on a fresh database', async () => {
    await new PresetProviderSeeder().run(createDbService({}));

    expect(providerService.batchUpsert).toHaveBeenCalledWith([
      { name: 'Recommended', providerId: 'recommended' },
    ]);
  });

  test('preserves an intentionally empty provider list after the first seed', async () => {
    await new PresetProviderSeeder().run(createDbService({ hasSeedJournal: true }));

    expect(providerService.batchUpsert).toHaveBeenCalledWith([]);
  });

  test('refreshes only providers that remain installed', async () => {
    await new PresetProviderSeeder().run(
      createDbService({
        existingProviders: [{ providerId: 'optional', presetProviderId: 'optional' }],
        hasSeedJournal: true,
      }),
    );

    expect(providerService.batchUpsert).toHaveBeenCalledWith([
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

    expect(providerService.batchUpsert).toHaveBeenCalledWith([
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
  } as unknown as DbService;
}
