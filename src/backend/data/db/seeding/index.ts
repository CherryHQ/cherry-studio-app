import { editionCapabilities } from '@/shared/data/managedPolicy';

import type { DbService } from '../DbService';
import { PreferenceSeeder } from './seeders/PreferenceSeeder';
import { PresetProviderSeeder } from './seeders/PresetProviderSeeder';
import { SeedRunner } from './SeedRunner';
import type { DatabaseSeeder } from './types';

export async function seedDatabase(dbService: DbService) {
  await new SeedRunner(dbService).runAll(createSeeders());
}

function createSeeders(): DatabaseSeeder[] {
  // Without provider settings, providers come from the enterprise server only.
  return editionCapabilities().providerSettings
    ? [new PreferenceSeeder(), new PresetProviderSeeder()]
    : [new PreferenceSeeder()];
}
