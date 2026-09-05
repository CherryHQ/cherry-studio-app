import { eq } from 'drizzle-orm';

import {
  createPresetProviderInput,
  isRecommendedPresetProvider,
} from '@/backend/data/services/presetProviders';
import { providerRegistryService } from '@/backend/data/services/ProviderRegistryService';
import { providerService } from '@/backend/data/services/ProviderService';

import { appStateTable } from '../../schemas/appState';
import { userProviderTable } from '../../schemas/userProvider';
import type { DatabaseSeeder } from '../types';

export class PresetProviderSeeder implements DatabaseSeeder {
  readonly name = 'preset-provider';
  readonly description = 'Install recommended providers and refresh installed presets';

  get version() {
    return `${providerRegistryService.getProvidersVersion()}+installed-presets.1`;
  }

  async run(dbService: Parameters<DatabaseSeeder['run']>[0]) {
    const db = dbService.getDb();
    const [existingRows, previousRuns] = await Promise.all([
      db.select({ providerId: userProviderTable.providerId }).from(userProviderTable),
      db
        .select({ key: appStateTable.key })
        .from(appStateTable)
        .where(eq(appStateTable.key, `seed:${this.name}`))
        .limit(1),
    ]);
    const existingProviderIds = new Set(existingRows.map(({ providerId }) => providerId));
    // An empty provider table is only a fresh install before this seeder has
    // ever run. Once journaled, empty means the user deliberately removed all
    // providers and a registry-version refresh must preserve that choice.
    const isFreshInstall = existingProviderIds.size === 0 && previousRuns.length === 0;
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
