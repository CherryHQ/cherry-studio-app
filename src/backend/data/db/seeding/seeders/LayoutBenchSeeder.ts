import { assistantTable, userModelTable } from '@/backend/data/db/schemas';
import {
  LAYOUT_BENCH_PROVIDER_ID,
  layoutBenchAssistant,
  layoutBenchModel,
  layoutBenchProvider,
} from '@/backend/data/fixtures/layoutBench';
import { providerService } from '@/backend/data/services/ProviderService';

import { hashObject } from '../hashObject';
import type { DatabaseSeeder } from '../types';

export class LayoutBenchSeeder implements DatabaseSeeder {
  readonly name = 'layout-bench';
  readonly description = 'Insert the layout benchmark mock provider, model and assistant';
  readonly version: string;

  constructor() {
    this.version = hashObject({
      assistant: layoutBenchAssistant,
      model: layoutBenchModel,
      provider: layoutBenchProvider,
    });
  }

  async run(dbService: Parameters<DatabaseSeeder['run']>[0]) {
    await providerService.batchUpsert([layoutBenchProvider]);
    // `toInsert` 让新 provider 一律以 disabled 落库（等某个流程确认它有可用模型再打开）。
    // 基准 provider 的模型由种子直接写入，永远走不到那个流程，所以在这里显式打开——
    // 与 `PresetProviderSeeder` 对 CherryAI 的处理同理。
    await providerService.update(LAYOUT_BENCH_PROVIDER_ID, { isEnabled: true });

    await dbService.withWriteTx(async (tx) => {
      await tx.insert(userModelTable).values(layoutBenchModel).onConflictDoUpdate({
        target: userModelTable.id,
        set: layoutBenchModel,
      });

      await tx
        .insert(assistantTable)
        .values(layoutBenchAssistant)
        .onConflictDoUpdate({
          target: assistantTable.id,
          set: { ...layoutBenchAssistant, deletedAt: null },
        });
    });
  }
}
