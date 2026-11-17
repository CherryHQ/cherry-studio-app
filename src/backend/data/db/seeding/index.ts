import type { ProviderEdition } from '@cherrystudio/provider-registry';

import { editionCapabilities } from '@/shared/data/managedPolicy';

import type { DbService } from '../DbService';
import { PreferenceSeeder } from './seeders/PreferenceSeeder';
import { PresetProviderSeeder } from './seeders/PresetProviderSeeder';
import { SeedRunner } from './SeedRunner';
import type { DatabaseSeeder } from './types';

export async function seedDatabase(dbService: DbService) {
  await new SeedRunner(dbService).runAll(createSeeders());
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

function createSeeders(): DatabaseSeeder[] {
  return [new PreferenceSeeder()];
}
