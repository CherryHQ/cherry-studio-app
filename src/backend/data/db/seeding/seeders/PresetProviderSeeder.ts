import {
  createPresetProviderInput,
  isRecommendedPresetProvider,
} from '@/backend/data/services/presetProviders';
import { providerRegistryService } from '@/backend/data/services/ProviderRegistryService';
import { providerService } from '@/backend/data/services/ProviderService';

import { userProviderTable } from '../../schemas/userProvider';
import type { DatabaseSeeder } from '../types';

export class PresetProviderSeeder implements DatabaseSeeder {
  readonly name = 'preset-provider';
  readonly description = 'Install recommended providers and refresh installed presets';

  get version() {
    return `${providerRegistryService.getProvidersVersion()}+installed-presets.1`;
  }

  async run(dbService: Parameters<DatabaseSeeder['run']>[0]) {
    const existingRows = await dbService
      .getDb()
      .select({ providerId: userProviderTable.providerId })
      .from(userProviderTable);
    const existingProviderIds = new Set(existingRows.map(({ providerId }) => providerId));
    const isFreshInstall = existingProviderIds.size === 0;
    const rows = providerRegistryService
      .loadProviders()
      .filter((provider) =>
        isFreshInstall
          ? isRecommendedPresetProvider(provider.id)
          : existingProviderIds.has(provider.id),
      )
      .map(createPresetProviderInput);

    await providerService.batchUpsert(rows);
  }
}
