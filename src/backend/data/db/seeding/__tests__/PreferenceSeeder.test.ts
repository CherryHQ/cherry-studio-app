import { PreferenceDefaults } from '@/shared/data/preference';

import type { DbService } from '../../DbService';
import { PreferenceSeeder } from '../seeders/PreferenceSeeder';

jest.mock('@/backend/data/db/schemas', () => ({
  DEFAULT_PREFERENCE_SCOPE: 'default',
  preferenceTable: { key: 'key', scope: 'scope' },
}));

function database(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  const db = {
    select: () => ({
      from: () => ({ where: async () => [...values.keys()].map((key) => ({ key })) }),
    }),
    insert: () => ({
      values: (row: { key: string; value: unknown }) => ({
        onConflictDoNothing: async () => {
          if (!values.has(row.key)) values.set(row.key, row.value);
        },
      }),
    }),
  };
  return {
    values,
    service: {
      getDb: () => db,
      withWriteTx: (run: (tx: typeof db) => Promise<void>) => run(db),
    } as unknown as DbService,
  };
}

test('new installs prefer native tools even when an unrelated bootstrap preference already exists', async () => {
  const db = database({ 'app.language': 'zh-CN' });
  await new PreferenceSeeder().run(db.service);
  expect(db.values.get('chat.web_search.model_tools_preferred')).toBe(true);
  expect(db.values.get('app.language')).toBe('zh-CN');
});

test('upgrades preserve external search and later seeding preserves an explicit native preference', async () => {
  const { 'chat.web_search.model_tools_preferred': _preference, ...legacy } = PreferenceDefaults;
  const db = database(legacy);
  await new PreferenceSeeder().run(db.service);
  expect(db.values.get('chat.web_search.model_tools_preferred')).toBe(false);
  db.values.set('chat.web_search.model_tools_preferred', true);
  await new PreferenceSeeder().run(db.service);
  expect(db.values.get('chat.web_search.model_tools_preferred')).toBe(true);
});
