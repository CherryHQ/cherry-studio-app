import { inArray } from 'drizzle-orm';

import { loggerService } from '@logger';
import type { DbService } from '@/data/db/DbService';
import { appStateTable } from '@/data/db/schema/appState';

import type { DatabaseSeeder } from './types';

const logger = loggerService.withContext('SeedRunner');
const seedKeyPrefix = 'seed:';

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

    for (const seeder of seeders) {
      const key = `${seedKeyPrefix}${seeder.name}`;
      const journal = journalMap.get(key);

      if (journal?.version === seeder.version) {
        logger.debug(`Skipping seed "${seeder.name}" (v${seeder.version}) - already applied`);
        continue;
      }

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
