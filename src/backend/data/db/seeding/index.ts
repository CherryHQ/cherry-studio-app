import type { CacheService } from '@/backend/data/CacheService';

import type { DbService } from '../DbService';
import { CherryAiDefaultModelSeeder } from './seeders/CherryAiDefaultModelSeeder';
import { DefaultAssistantSeeder } from './seeders/DefaultAssistantSeeder';
import { MockChatSeeder } from './seeders/MockChatSeeder';
import { PreferenceSeeder } from './seeders/PreferenceSeeder';
import { PresetProviderSeeder } from './seeders/PresetProviderSeeder';
import { SeedRunner } from './SeedRunner';
import type { DatabaseSeeder } from './types';

export async function seedDatabase(dbService: DbService, cacheService: CacheService) {
  await new SeedRunner(dbService).runAll(await createSeeders(cacheService));
}

async function createSeeders(cacheService: CacheService): Promise<DatabaseSeeder[]> {
  const seeders: DatabaseSeeder[] = [
    new CherryAiDefaultModelSeeder(),
    new DefaultAssistantSeeder(),
    new PreferenceSeeder(),
    new PresetProviderSeeder(cacheService),
  ];

  if (isDevelopmentBuild()) {
    seeders.push(new MockChatSeeder());
  }

  return seeders;
}

function isDevelopmentBuild() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}
