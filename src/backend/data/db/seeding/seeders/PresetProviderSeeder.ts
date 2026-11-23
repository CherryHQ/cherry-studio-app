import type { ProviderEdition } from '@cherrystudio/provider-registry';
import { eq } from 'drizzle-orm';

import {
  createPresetProviderInput,
  isRecommendedPresetProvider,
} from '@/backend/data/services/presetProviders';
import { providerRegistryService } from '@/backend/data/services/ProviderRegistryService';
import { batchUpsertProviders } from '@/backend/data/services/ProviderService';
import { CLOUD_PROVIDER_ID } from '@/shared/contracts/cloud';

import { appStateTable } from '../../schemas/appState';
import { userProviderTable } from '../../schemas/userProvider';
import type { DatabaseSeeder } from '../types';

export class PresetProviderSeeder implements DatabaseSeeder {
  readonly name = 'preset-provider';
  readonly description = 'Install recommended providers and refresh installed presets';

  constructor(private readonly getEdition: () => Promise<ProviderEdition> = async () => 'global') {}

  get version() {
    return `${providerRegistryService.getProvidersVersion()}+installed-presets.2`;
  }

  async run(dbService: Parameters<DatabaseSeeder['run']>[0]) {
    const db = dbService.getDb();
    const [existingRows, previousRuns] = await Promise.all([
      db
        .select({
          providerId: userProviderTable.providerId,
          presetProviderId: userProviderTable.presetProviderId,
        })
        .from(userProviderTable),
      db
        .select({ key: appStateTable.key })
        .from(appStateTable)
        .where(eq(appStateTable.key, `seed:${this.name}`))
        .limit(1),
    ]);
    // CherryAI is installed before the first preset seed. After that seed is journaled,
    // preserve the user's choice even if they removed every ordinary provider.
    const isFreshInstall =
      previousRuns.length === 0 &&
      existingRows.every((row) => row.providerId === CLOUD_PROVIDER_ID);
    const edition = isFreshInstall ? await this.getEdition() : 'global';
    const catalog = providerRegistryService.loadProviders();
    const catalogById = new Map(catalog.map((provider) => [provider.id, provider]));
    const rows = isFreshInstall
      ? catalog
          .filter(
            (provider) =>
              isRecommendedPresetProvider(provider.id) &&
              (!provider.availableInEditions || provider.availableInEditions.includes(edition)),
          )
          .map(createPresetProviderInput)
      : existingRows.flatMap(({ providerId, presetProviderId }) => {
          if (!presetProviderId) return [];
          const preset = catalogById.get(providerId) ?? catalogById.get(presetProviderId);
          return preset ? [{ ...createPresetProviderInput(preset), providerId }] : [];
        });

    await dbService.withWriteTx((tx) => batchUpsertProviders(tx, rows));
  }
}
