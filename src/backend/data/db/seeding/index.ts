import type { ProviderEdition } from '@cherrystudio/provider-registry';

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
  await new SeedRunner(dbService).runAll([new PresetProviderSeeder(getEdition)]);
}

function createSeeders(): DatabaseSeeder[] {
  return [new PreferenceSeeder()];
}
