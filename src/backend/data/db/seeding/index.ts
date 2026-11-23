import type { ProviderEdition } from '@cherrystudio/provider-registry';

import { editionCapabilities } from '@/shared/data/managedPolicy';
import { isDevMockProviderEnabled } from '@/shared/utils/devMockProvider';

import type { DbService } from '../DbService';
import { cloudProviderSeed } from './seeders/cloudProviderSeed';
import { syncDevMockProvider } from './seeders/devMockProviderSeed';
import { PreferenceSeeder } from './seeders/PreferenceSeeder';
import { PresetProviderSeeder } from './seeders/PresetProviderSeeder';
import { SeedRunner } from './SeedRunner';

export async function seedDatabase(dbService: DbService) {
  await new SeedRunner(dbService).runAll([
    new PreferenceSeeder(),
    ...(editionCapabilities().providerSettings ? [cloudProviderSeed] : []),
  ]);
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    await syncDevMockProvider(dbService, isDevMockProviderEnabled());
  }
}

/** Provider discovery waits for IP policy only when installing the first recommended set. */
export async function seedPresetProviders(
  dbService: DbService,
  getEdition: () => Promise<ProviderEdition>,
): Promise<void> {
  // Enterprise providers are delivered by the organization, never seeded locally.
  if (!editionCapabilities().providerSettings) return;
  await new SeedRunner(dbService).runAll([new PresetProviderSeeder(getEdition)]);
}
