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
    const db = dbService.getDb();
    const preferences = await db
      .select({
        scope: preferenceTable.scope,
        key: preferenceTable.key,
      })
      .from(preferenceTable);

    // Convert existing preferences to a Set for quick lookup.
    const existingPreferences = new Set(
      preferences.map((preference) => `${preference.scope}.${preference.key}`),
    );
    // Collect all new preferences to insert.
    const newPreferences: {
      scope: string;
      key: string;
      value: unknown;
    }[] = [];

    // Process each scope in the complete mobile preference surface.
    for (const [scope, scopeData] of Object.entries(PreferenceDefaults)) {
      // Process each key-value pair in the scope.
      for (const [key, value] of Object.entries(scopeData)) {
        const preferenceKey = `${scope}.${key}`;

        // Skip if this preference already exists.
        if (existingPreferences.has(preferenceKey)) {
          continue;
        }

        // Add to new preferences array.
        newPreferences.push({
          scope,
          key,
          value,
        });
      }
    }

    if (newPreferences.length === 0) {
      return;
    }

    // Insert new preferences without overwriting existing user values.
    await dbService.withWriteTx(async (tx) => {
      for (const preference of newPreferences) {
        // react-doctor-disable-next-line async-await-in-loop -- expo-sqlite 写事务内本质串行，并行化无收益
        await tx
          .insert(preferenceTable)
          .values(preference)
          .onConflictDoNothing({
            target: [preferenceTable.scope, preferenceTable.key],
          });
      }
    });
  }
}
