import { loggerService } from '@logger';
import { inArray } from 'drizzle-orm';

import type { DbService } from '@/backend/data/db/DbService';
import { appStateTable } from '@/backend/data/db/schemas/appState';

import type { DatabaseSeeder } from './types';

const logger = loggerService.withContext('SeedRunner');
const seedKeyPrefix = 'seed:';
const bootstrapMarkerKey = 'seedRunner:bootstrapCompleted';
const legacyDefaultAssistantJournalKey = `${seedKeyPrefix}default-assistant`;

type SeedJournal = {
  version: string;
};

export class SeedRunner {
  constructor(private readonly dbService: DbService) {}

  async runAll(seeders: DatabaseSeeder[]) {
    if (seeders.length === 0) {
      return;
    }

    const journalKeys = seeders.map((seeder) => `${seedKeyPrefix}${seeder.name}`);
    const journalMap = await this.loadJournals(journalKeys);
    const bootstrapState = await this.loadBootstrapState();

    for (const seeder of seeders) {
      if (seeder.executionPolicy === 'bootstrap-only' && bootstrapState.completed) {
        logger.debug(`Skipping seed "${seeder.name}" (bootstrap-only) - bootstrap window closed`);
        continue;
      }

      const key = `${seedKeyPrefix}${seeder.name}`;
      const journal = journalMap.get(key);

      if (journal?.version === seeder.version) {
        logger.debug(`Skipping seed "${seeder.name}" (v${seeder.version}) - already applied`);
        continue;
      }

      // react-doctor-disable-next-line async-await-in-loop -- seeder 需按声明顺序执行，且每个跑完后立即写 journal 记录进度
      await seeder.run(this.dbService);

      await this.dbService.withWriteTx(async (tx) => {
        await tx
          .insert(appStateTable)
          .values({
            description: seeder.description,
            key,
            value: { version: seeder.version },
          })
          .onConflictDoUpdate({
            target: appStateTable.key,
            set: {
              description: seeder.description,
              updatedAt: Date.now(),
              value: { version: seeder.version },
            },
          });
      });

      logger.info(`Seed "${seeder.name}" applied (v${seeder.version}) - ${seeder.description}`);
    }

    if (!bootstrapState.hasMarker) {
      await this.markBootstrapCompleted();
    }
  }

  private async loadBootstrapState() {
    const rows = await this.dbService
      .getDb()
      .select({ key: appStateTable.key })
      .from(appStateTable)
      .where(inArray(appStateTable.key, [bootstrapMarkerKey, legacyDefaultAssistantJournalKey]));
    const keys = new Set(rows.map((row) => row.key));

    return {
      completed: keys.has(bootstrapMarkerKey) || keys.has(legacyDefaultAssistantJournalKey),
      hasMarker: keys.has(bootstrapMarkerKey),
    };
  }

  private async markBootstrapCompleted() {
    await this.dbService.withWriteTx(async (tx) => {
      await tx
        .insert(appStateTable)
        .values({
          description:
            'Set after the first fully-successful seeding pass; bootstrap-only seeders never run once present',
          key: bootstrapMarkerKey,
          value: { completedAt: Date.now() },
        })
        .onConflictDoNothing({ target: appStateTable.key });
    });
  }

  private async loadJournals(keys: string[]) {
    const rows = await this.dbService
      .getDb()
      .select({
        key: appStateTable.key,
        value: appStateTable.value,
      })
      .from(appStateTable)
      .where(inArray(appStateTable.key, keys));

    const map = new Map<string, SeedJournal>();

    for (const row of rows) {
      map.set(row.key, row.value as SeedJournal);
    }

    return map;
  }
}
