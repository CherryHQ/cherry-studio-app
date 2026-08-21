import { preferenceTable } from '@/backend/data/db/schemas';
import { PreferenceDefaults } from '@/shared/data/preference';

import { hashObject } from '../hashObject';
import type { DatabaseSeeder } from '../types';

export class PreferenceSeeder implements DatabaseSeeder {
  readonly name = 'preference';
  readonly description = 'Insert default preference values';
  readonly version: string;

  constructor() {
    this.version = hashObject(PreferenceDefaults);
  }

  async run(dbService: Parameters<DatabaseSeeder['run']>[0]) {
    const stored = await dbService
      .getDb()
      .select({ key: preferenceTable.key })
      .from(preferenceTable);
    const storedKeys = new Set(stored.map((preference) => preference.key));
    const missing = Object.entries(PreferenceDefaults).filter(([key]) => !storedKeys.has(key));

    if (missing.length === 0) {
      return;
    }

    // `onConflictDoNothing` rather than an upsert: a key already in the table
    // holds the user's value, and seeding must never overwrite it.
    await dbService.withWriteTx(async (tx) => {
      for (const [key, value] of missing) {
        // react-doctor-disable-next-line async-await-in-loop -- expo-sqlite 写事务内本质串行，并行化无收益
        await tx.insert(preferenceTable).values({ key, value }).onConflictDoNothing();
      }
    });
  }
}
