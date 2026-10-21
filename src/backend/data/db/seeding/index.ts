import { isEnterpriseProfile } from '@/shared/data/activeProfile';

import type { DbService } from '../DbService';
import { PreferenceSeeder } from './seeders/PreferenceSeeder';
import { PresetProviderSeeder } from './seeders/PresetProviderSeeder';
import { SeedRunner } from './SeedRunner';
import type { DatabaseSeeder } from './types';

export async function seedDatabase(dbService: DbService) {
  await new SeedRunner(dbService).runAll(createSeeders());
}

function createSeeders(): DatabaseSeeder[] {
  // Enterprise profiles get their providers from the enterprise server only.
  return isEnterpriseProfile()
    ? [new PreferenceSeeder()]
    : [new PreferenceSeeder(), new PresetProviderSeeder()];
}
