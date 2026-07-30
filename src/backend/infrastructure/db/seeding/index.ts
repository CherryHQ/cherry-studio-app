import type { DbService } from '../DbService';
import { SeedRunner } from './SeedRunner';
import { DefaultAssistantSeeder } from './seeders/DefaultAssistantSeeder';
import { MockChatSeeder } from './seeders/MockChatSeeder';
import { PreferenceSeeder } from './seeders/PreferenceSeeder';
import { PresetProviderSeeder } from './seeders/PresetProviderSeeder';
import type { DatabaseSeeder } from './types';

export async function seedDatabase(dbService: DbService) {
  await new SeedRunner(dbService).runAll(await createSeeders());
}

async function createSeeders(): Promise<DatabaseSeeder[]> {
  const seeders: DatabaseSeeder[] = [
    new PreferenceSeeder(),
    new PresetProviderSeeder(),
    new DefaultAssistantSeeder(),
  ];

  if (isDevelopmentBuild()) {
    seeders.push(new MockChatSeeder());
  }

  return seeders;
}

function isDevelopmentBuild() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}
