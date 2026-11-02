import { LOCAL_PROFILE, setActiveProfile } from '@/shared/data/activeProfile';
import { PreferenceDefaults, ThemeMode } from '@/shared/data/preference';

import type { DbService } from '../../DbService';
import { PreferenceSeeder } from '../seeders/PreferenceSeeder';

jest.mock('@/backend/data/db/schemas', () => ({
  DEFAULT_PREFERENCE_SCOPE: 'default',
  preferenceTable: { key: 'key', scope: 'scope' },
}));

afterEach(() => setActiveProfile(LOCAL_PROFILE));

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

test('a new profile inherits application settings without copying identity or model configuration', async () => {
  setActiveProfile({
    id: 'new-profile',
    identity: { deployment: 'server', subject: 'user', authentication: 'password' },
    address: 'https://example.com',
    initialPreferences: {
      'app.language': 'zh-CN',
      'ui.theme_mode': ThemeMode.dark,
      'ui.font_size_step': 2,
      'chat.completion_notifications.enabled': false,
      'app.feedback.shake_enabled': true,
      'app.privacy.data_collection.enabled': false,
      'app.privacy.policy_version': 'consent-version',
      'app.user.name': 'Other user',
      'app.user.id': 'other-analytics-id',
      'app.user.avatar': 'avatar-file:other.webp',
      'app.onboarding.status': 'completed',
      'agent.default_model_id': 'other-model',
      'chat.web_search.provider_overrides': { jina: { apiKey: 'other-key' } },
    },
  });
  const db = database();
  await new PreferenceSeeder().run(db.service);
  expect(Object.fromEntries(db.values)).toEqual({
    ...PreferenceDefaults,
    'app.language': 'zh-CN',
    'ui.theme_mode': ThemeMode.dark,
    'ui.font_size_step': 2,
    'chat.completion_notifications.enabled': false,
    'app.feedback.shake_enabled': true,
    'app.privacy.data_collection.enabled': false,
    'app.privacy.policy_version': 'consent-version',
  });

  db.values.set('ui.theme_mode', ThemeMode.light);
  await new PreferenceSeeder().run(db.service);
  expect(db.values.get('ui.theme_mode')).toBe(ThemeMode.light);
});

test('an existing database never inherits settings, including missing preferences on upgrade', async () => {
  setActiveProfile({
    id: 'existing-profile',
    identity: { deployment: 'server', subject: 'user', authentication: 'password' },
    address: 'https://example.com',
    initialPreferences: { 'ui.theme_mode': ThemeMode.dark, 'ui.font_size_step': 2 },
  });
  const db = database({ 'ui.theme_mode': ThemeMode.light });
  await new PreferenceSeeder().run(db.service);
  expect(db.values.get('ui.theme_mode')).toBe(ThemeMode.light);
  expect(db.values.get('ui.font_size_step')).toBe(PreferenceDefaults['ui.font_size_step']);
});
