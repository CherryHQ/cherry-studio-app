import { getPiAgentExperimentConfig } from '@/shared/config/piAgentExperiment';

import type { DbService } from '../DbService';
import { CherryAiDefaultModelSeeder } from './seeders/CherryAiDefaultModelSeeder';
import { DefaultAssistantSeeder } from './seeders/DefaultAssistantSeeder';
import { LayoutBenchSeeder } from './seeders/LayoutBenchSeeder';
import { MockChatSeeder } from './seeders/MockChatSeeder';
import { PiAgentExperimentSeeder } from './seeders/PiAgentExperimentSeeder';
import { PreferenceSeeder } from './seeders/PreferenceSeeder';
import { PresetProviderSeeder } from './seeders/PresetProviderSeeder';
import { SeedRunner } from './SeedRunner';
import type { DatabaseSeeder } from './types';

export async function seedDatabase(dbService: DbService) {
  await new SeedRunner(dbService).runAll(await createSeeders());
}

async function createSeeders(): Promise<DatabaseSeeder[]> {
  const seeders: DatabaseSeeder[] = [
    new CherryAiDefaultModelSeeder(),
    new DefaultAssistantSeeder(),
    new PreferenceSeeder(),
    new PresetProviderSeeder(),
  ];

  if (isDevelopmentBuild()) {
    const piAgentExperiment = getPiAgentExperimentConfig();
    if (piAgentExperiment) {
      seeders.push(new PiAgentExperimentSeeder(piAgentExperiment));
    }
    seeders.push(new MockChatSeeder());
    seeders.push(new LayoutBenchSeeder());
  }

  return seeders;
}

function isDevelopmentBuild() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}
