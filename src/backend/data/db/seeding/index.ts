import type { DbService } from '../DbService';
import { PreferenceSeeder } from './seeders/PreferenceSeeder';
import { PresetProviderSeeder } from './seeders/PresetProviderSeeder';
import { SeedRunner } from './SeedRunner';
import type { DatabaseSeeder } from './types';

export async function seedDatabase(dbService: DbService) {
  await new SeedRunner(dbService).runAll(createSeeders());
}

function createSeeders(): DatabaseSeeder[] {
  return [new PreferenceSeeder(), new PresetProviderSeeder()];
}
