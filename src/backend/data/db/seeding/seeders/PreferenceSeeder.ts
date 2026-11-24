import { eq } from 'drizzle-orm';

import { DEFAULT_PREFERENCE_SCOPE, preferenceTable } from '@/backend/data/db/schemas';
import { getActiveProfile } from '@/shared/data/activeProfile';
import {
  INHERITABLE_PREFERENCE_KEYS,
  PreferenceDefaults,
  type PreferenceSchema,
} from '@/shared/data/preference';

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
      .select({ key: preferenceTable.key, value: preferenceTable.value })
      .from(preferenceTable)
      .where(eq(preferenceTable.scope, DEFAULT_PREFERENCE_SCOPE));
    const storedKeys = new Set(stored.map((preference) => preference.key));
    const defaults: PreferenceSchema = { ...PreferenceDefaults };
    if (!storedKeys.has('chat.web_search.model_tools')) {
      const legacy = stored.find(
        (preference) => preference.key === 'chat.web_search.model_tools_preferred',
      )?.value;
      defaults['chat.web_search.model_tools'] =
        legacy === true
          ? 'preferred'
          : legacy === false || storedKeys.has('chat.web_search.default_search_keywords_provider')
            ? 'fallback'
            : 'preferred';
    }
    const profile = getActiveProfile();
    // A single transaction seeds every preference. Restarts, upgrades and existing databases
    // keep their own values, even when the registry still holds the original snapshot.
    if (storedKeys.size === 0 && profile.identity && profile.initialPreferences) {
      for (const key of INHERITABLE_PREFERENCE_KEYS) {
        const value = profile.initialPreferences[key];
        if (value !== undefined) Object.assign(defaults, { [key]: value });
      }
    }
    const missing = Object.entries(defaults).filter(([key]) => !storedKeys.has(key));

    if (missing.length === 0) {
      return;
    }

    // `onConflictDoNothing` rather than an upsert: a key already in the table
    // holds the user's value, and seeding must never overwrite it.
    await dbService.withWriteTx(async (tx) => {
      for (const [key, value] of missing) {
        // react-doctor-disable-next-line async-await-in-loop -- expo-sqlite 写事务内本质串行，并行化无收益
        await tx
          .insert(preferenceTable)
          .values({ key, scope: DEFAULT_PREFERENCE_SCOPE, value })
          .onConflictDoNothing();
      }
    });
  }
}
