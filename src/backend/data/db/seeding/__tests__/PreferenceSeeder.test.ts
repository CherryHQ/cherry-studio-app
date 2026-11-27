import { LOCAL_PROFILE, setActiveProfile } from '@/shared/data/activeProfile';
import { PreferenceDefaults, ThemeMode } from '@/shared/data/preference';

import type { DbService } from '../../DbService';
import { PreferenceSeeder } from '../seeders/PreferenceSeeder';

jest.mock('@/backend/data/db/schemas', () => ({
  DEFAULT_PREFERENCE_SCOPE: 'default',
  preferenceTable: { key: 'key', scope: 'scope', value: 'value' },
}));

afterEach(() => setActiveProfile(LOCAL_PROFILE));

function database(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  const db = {
    select: jest.fn(() => ({
      from: () => ({ where: async () => [...values].map(([key, value]) => ({ key, value })) }),
    })),
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
    select: db.select,
    service: {
      getDb: () => db,
      withWriteTx: (run: (tx: typeof db) => Promise<void>) => run(db),
    } as unknown as DbService,
  };
}

test('new installs prefer native tools even when an unrelated bootstrap preference already exists', async () => {
  const db = database({ 'app.language': 'zh-CN' });
  await new PreferenceSeeder().run(db.service);
  expect(db.values.get('chat.web_search.model_tools')).toBe('preferred');
  expect(db.values.get('app.language')).toBe('zh-CN');
});

test('upgrades preserve external search and later seeding preserves an explicit native preference', async () => {
  const { 'chat.web_search.model_tools': _preference, ...legacy } = PreferenceDefaults;
  const db = database(legacy);
  await new PreferenceSeeder().run(db.service);
  expect(db.values.get('chat.web_search.model_tools')).toBe('fallback');
  db.values.set('chat.web_search.model_tools', 'preferred');
  await new PreferenceSeeder().run(db.service);
  expect(db.values.get('chat.web_search.model_tools')).toBe('preferred');
});

test('a new profile inherits application and onboarding settings without copying identity or model configuration', async () => {
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
    'app.onboarding.status': 'completed',
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

test.each([
  [true, false, 'preferred'],
  [true, true, 'preferred'],
  [false, false, 'fallback'],
  [false, true, 'fallback'],
] as const)(
  'migrates exact legacy booleans before the provider-marker heuristic (%s, marker %s)',
  async (legacy, marker, expected) => {
    const oldKey = 'chat.web_search.model_tools_preferred';
    const db = database({
      [oldKey]: legacy,
      ...(marker ? { 'chat.web_search.default_search_keywords_provider': 'tavily' } : {}),
    });
    await new PreferenceSeeder().run(db.service);
    expect(db.values.get('chat.web_search.model_tools')).toBe(expected);
    expect(db.values.get(oldKey)).toBe(legacy);
    expect(db.select).toHaveBeenCalledWith({ key: 'key', value: 'value' });
    await new PreferenceSeeder().run(db.service);
    expect(db.values.get('chat.web_search.model_tools')).toBe(expected);
    expect(db.values.get(oldKey)).toBe(legacy);
  },
);

test.each([
  [{ 'chat.web_search.default_search_keywords_provider': 'tavily' }, 'fallback'],
  [
    {
      'chat.web_search.model_tools_preferred': 'true',
      'chat.web_search.default_search_keywords_provider': 'tavily',
    },
    'fallback',
  ],
  [{ 'chat.web_search.model_tools_preferred': null }, 'preferred'],
  [{ 'chat.web_search.model_tools_preferred': 'false' }, 'preferred'],
  [{}, 'preferred'],
  [{ 'app.language': 'zh-CN' }, 'preferred'],
])(
  'uses the provider marker only when no valid legacy boolean exists (%p)',
  async (initial, expected) => {
    const db = database(initial as Record<string, unknown>);
    await new PreferenceSeeder().run(db.service);
    expect(db.values.get('chat.web_search.model_tools')).toBe(expected);
    for (const [key, value] of Object.entries(initial)) expect(db.values.get(key)).toEqual(value);
  },
);

test.each(['preferred', 'fallback', 'disabled', null, 'invalid', false])(
  'never overwrites an existing new policy or consults legacy over it (%p)',
  async (value) => {
    const db = database({
      'chat.web_search.model_tools': value,
      'chat.web_search.model_tools_preferred': true,
      'chat.web_search.default_search_keywords_provider': 'tavily',
    });
    const seeder = new PreferenceSeeder();
    await seeder.run(db.service);
    await seeder.run(db.service);
    expect(db.values.get('chat.web_search.model_tools')).toBe(value);
    expect(db.values.get('chat.web_search.model_tools_preferred')).toBe(true);
  },
);

test('new installs default background reading to false independently of unrelated preferences', async () => {
  const db = database({ 'app.language': 'zh-CN' });
  await new PreferenceSeeder().run(db.service);
  expect(db.values.get('feature.voice.background_reading')).toBe(false);
});

test.each([
  [true, true],
  [false, false],
  [null, false],
] as const)(
  'migrates app.background_audio.consent (%s) once into feature.voice.background_reading (%s) without overwriting explicit values',
  async (legacyConsent, expected) => {
    const db = database({ 'app.background_audio.consent': legacyConsent });
    const seeder = new PreferenceSeeder();
    await seeder.run(db.service);
    expect(db.values.get('feature.voice.background_reading')).toBe(expected);

    db.values.set('feature.voice.background_reading', !expected);
    db.values.set('app.background_audio.consent', !legacyConsent);
    await seeder.run(db.service);
    expect(db.values.get('feature.voice.background_reading')).toBe(!expected);
  },
);

test('preserves an explicit false background reading choice when legacy audio consent is true', async () => {
  const db = database({
    'app.background_audio.consent': true,
    'feature.voice.background_reading': false,
  });
  await new PreferenceSeeder().run(db.service);
  expect(db.values.get('feature.voice.background_reading')).toBe(false);
  expect(db.values.get('app.background_audio.consent')).toBe(true);
});
