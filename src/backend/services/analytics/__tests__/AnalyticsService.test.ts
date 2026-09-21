import { AnalyticsClient } from '@cherrystudio/analytics-client';
import { AppState } from 'react-native';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import type { PreferenceKeyType, PreferenceSchema } from '@/shared/data/preference';
import { LATEST_PRIVACY_POLICY_VERSION } from '@/shared/utils/privacyConsent';

import { AnalyticsService } from '../AnalyticsService';

const DESKTOP_CLIENT_ID = '99999999-8888-4777-8666-555555555555';
const LOCAL_CLIENT_ID = '11111111-2222-4333-8444-555555555555';

jest.mock('expo-crypto', () => ({ randomUUID: () => LOCAL_CLIENT_ID }));
jest.mock('@cherrystudio/analytics-client', () => ({
  AnalyticsClient: jest.fn(),
}));

const analyticsClientMock = AnalyticsClient as unknown as jest.Mock;

/** Lets each assertion run after the service's queued activation work settles. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

function createClient() {
  return {
    destroy: jest.fn(async () => ({
      acknowledgedEvents: 0,
      discardedEvents: 0,
      pendingEvents: 0,
      pendingRequests: 0,
      timedOut: false,
    })),
    flush: jest.fn(async () => null),
    setClientId: jest.fn(),
    trackAppLaunch: jest.fn(),
    trackAppUpdate: jest.fn(async () => ({ success: true })),
    trackTokenUsage: jest.fn(),
  };
}

function createPreference(initial: Partial<PreferenceSchema> = {}) {
  const values: Partial<PreferenceSchema> = {
    'app.privacy.data_collection.enabled': true,
    'app.privacy.policy_version': LATEST_PRIVACY_POLICY_VERSION,
    'app.user.id': LOCAL_CLIENT_ID,
    ...initial,
  };
  const listeners = new Map<PreferenceKeyType, Set<() => void>>();
  return {
    getCachedValue: (key: PreferenceKeyType) => values[key],
    getMultipleCached: (mapping: Record<string, PreferenceKeyType>) =>
      Object.fromEntries(Object.entries(mapping).map(([name, key]) => [name, values[key]])),
    set: jest.fn(async (key: PreferenceKeyType, value: never) => {
      values[key] = value;
      listeners.get(key)?.forEach((listener) => listener());
    }),
    subscribeChange: (key: PreferenceKeyType) => (listener: () => void) => {
      const bucket = listeners.get(key) ?? new Set();
      bucket.add(listener);
      listeners.set(key, bucket);
      return () => bucket.delete(listener);
    },
    values,
  };
}

function createCache(lastActivityDate = '') {
  const values: Record<string, unknown> = {
    'analytics.last_activity_date': lastActivityDate,
  };
  return {
    getPersist: (key: string) => values[key],
    setPersist: jest.fn((key: string, value: unknown) => {
      values[key] = value;
    }),
  };
}

type Harness = {
  cache: ReturnType<typeof createCache>;
  /** Drives the service's own app-state listener. */
  changeAppState: (status: string) => void;
  client: ReturnType<typeof createClient>;
  preference: ReturnType<typeof createPreference>;
  service: AnalyticsService;
};

async function startService(
  options: {
    cache?: ReturnType<typeof createCache>;
    client?: ReturnType<typeof createClient>;
    preference?: ReturnType<typeof createPreference>;
  } = {},
): Promise<Harness> {
  const cache = options.cache ?? createCache();
  const preference = options.preference ?? createPreference();
  const client = options.client ?? createClient();
  analyticsClientMock.mockImplementation(() => client);
  let changeAppState: (status: string) => void = () => undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    changeAppState = listener as typeof changeAppState;
    return { remove: jest.fn() };
  });
  await installTestHost({ CacheService: cache, PreferenceService: preference });
  const service = new AnalyticsService();
  await service._doInit();
  await settle();
  return { cache, changeAppState: (status) => changeAppState(status), client, preference, service };
}

afterEach(async () => {
  analyticsClientMock.mockReset();
  jest.restoreAllMocks();
  await uninstallTestHost();
});

/** A client whose activity ping never answers, as on a device with no route out. */
function createStalledClient() {
  const client = createClient();
  client.trackAppUpdate.mockImplementation(() => new Promise(() => {}) as never);
  return client;
}

it('reports through the platform channel once consent is in place', async () => {
  const { client } = await startService();

  expect(analyticsClientMock).toHaveBeenCalledTimes(1);
  expect(analyticsClientMock.mock.calls[0][0]).toMatchObject({
    channel: 'cherry-studio-ios',
    clientId: LOCAL_CLIENT_ID,
  });
  expect(client.trackAppLaunch).toHaveBeenCalledTimes(1);
  expect(client.trackAppUpdate).toHaveBeenCalledTimes(1);
});

it('collects nothing while the accepted policy is out of date', async () => {
  const preference = createPreference({ 'app.privacy.policy_version': '20200101' });
  const { client, service } = await startService({ preference });

  expect(analyticsClientMock).not.toHaveBeenCalled();
  service.trackTokenUsage({
    input_tokens: 1,
    model: 'gpt-4',
    output_tokens: 2,
    provider: 'openai',
  });
  expect(client.trackTokenUsage).not.toHaveBeenCalled();
});

it('discards queued events when consent is revoked, and keeps the launch report once', async () => {
  const { client, preference, service } = await startService();

  await preference.set('app.privacy.data_collection.enabled', false as never);
  await settle();
  expect(client.destroy).toHaveBeenCalledWith(expect.objectContaining({ flush: false }));

  service.trackTokenUsage({
    input_tokens: 1,
    model: 'gpt-4',
    output_tokens: 2,
    provider: 'openai',
  });
  expect(client.trackTokenUsage).not.toHaveBeenCalled();

  await preference.set('app.privacy.data_collection.enabled', true as never);
  await settle();
  // A relaunch report per process, not per activation.
  expect(client.trackAppLaunch).toHaveBeenCalledTimes(1);
});

it('reports activity at most once a day', async () => {
  const today = new Date();
  const dateKey = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}-${`${today.getDate()}`.padStart(2, '0')}`;
  const { client } = await startService({ cache: createCache(dateKey) });

  expect(client.trackAppUpdate).not.toHaveBeenCalled();
});

it('drains events under the old identity before adopting the desktop one', async () => {
  const { client, preference, service } = await startService();

  await service.adoptClientId(DESKTOP_CLIENT_ID);

  expect(client.flush).toHaveBeenCalled();
  expect(client.flush.mock.invocationCallOrder[0]).toBeLessThan(
    client.setClientId.mock.invocationCallOrder[0],
  );
  expect(client.setClientId).toHaveBeenCalledWith(DESKTOP_CLIENT_ID);
  expect(preference.values['app.user.id']).toBe(DESKTOP_CLIENT_ID);
});

it('ignores an unusable or unchanged desktop identity', async () => {
  const { client, service } = await startService();

  await service.adoptClientId('cherry-studio');
  await service.adoptClientId(LOCAL_CLIENT_ID);

  expect(client.setClientId).not.toHaveBeenCalled();
});

it('activates and tears down while the activity ping is still unanswered', async () => {
  const { client, preference } = await startService({ client: createStalledClient() });

  expect(client.trackAppUpdate).toHaveBeenCalledTimes(1);

  await preference.set('app.privacy.data_collection.enabled', false as never);
  await settle();

  expect(client.destroy).toHaveBeenCalledWith(expect.objectContaining({ flush: false }));
});

it('reports the day once when foreground events overlap an unanswered ping', async () => {
  const { changeAppState, client } = await startService({ client: createStalledClient() });

  changeAppState('active');
  changeAppState('active');
  await settle();

  expect(client.trackAppUpdate).toHaveBeenCalledTimes(1);
});
