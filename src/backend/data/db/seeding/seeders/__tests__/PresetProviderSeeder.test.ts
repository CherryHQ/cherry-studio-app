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
      createDbService({ existingProviderIds: ['optional'], hasSeedJournal: true }),
    );

    expect(providerService.batchUpsert).toHaveBeenCalledWith([
      { name: 'Optional', providerId: 'optional' },
    ]);
    expect(providerRegistryService.loadProviders).toHaveBeenCalledTimes(1);
  });
});

function createDbService({
  existingProviderIds = [],
  hasSeedJournal = false,
}: {
  existingProviderIds?: string[];
  hasSeedJournal?: boolean;
}): DbService {
  const db = {
    select: (projection: Record<string, unknown>) => ({
      from: () => {
        if ('providerId' in projection) {
          return Promise.resolve(existingProviderIds.map((providerId) => ({ providerId })));
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
