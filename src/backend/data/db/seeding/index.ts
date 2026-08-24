import type { DbService } from '../DbService';
import { AgentFromAssistantSeeder } from './seeders/AgentFromAssistantSeeder';
import { CherryAiDefaultModelSeeder } from './seeders/CherryAiDefaultModelSeeder';
import { DefaultAssistantSeeder } from './seeders/DefaultAssistantSeeder';
import { LayoutBenchSeeder } from './seeders/LayoutBenchSeeder';
import { MockChatSeeder } from './seeders/MockChatSeeder';
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
    // After DefaultAssistantSeeder, so a fresh install's default assistant is
    // copied into the agent table in the same pass.
    new AgentFromAssistantSeeder(),
    new PreferenceSeeder(),
    new PresetProviderSeeder(),
  ];

  if (isDevelopmentBuild()) {
    seeders.push(new MockChatSeeder());
    seeders.push(new LayoutBenchSeeder());
  }

  return seeders;
}

function isDevelopmentBuild() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}
