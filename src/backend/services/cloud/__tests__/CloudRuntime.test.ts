import { AppState, type AppStateStatus } from 'react-native';

import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import type { DbService } from '@/backend/data/db/DbService';
import type { CloudModel, CloudState } from '@/shared/contracts/cloud';

import { CloudRuntime } from '../CloudRuntime';
import type { CloudIdentity } from '../CloudSession';
import { cloudSnapshot } from './cloudFixtures';

const mockGet = jest.fn();
const mockRevoke = jest.fn();
const mockInference = jest.fn();
const mockRefreshServices = jest.fn();
const appStateListeners = new Set<(status: AppStateStatus) => void>();
const mockProject = jest.fn(
  async (
    _tx: unknown,
    _origin: string | null,
    _models: readonly CloudModel[],
    assertCurrent: () => void,
  ) => {
    assertCurrent();
    return [];
  },
);
jest.mock('../cloudDevice', () => ({ loadCloudDevice: async () => ({}) }));
jest.mock('../projectCloudModels', () => ({
  projectCloudModels: (...args: Parameters<typeof mockProject>) => mockProject(...args),
}));
jest.mock('../CloudSession', () => ({
  CloudSession: class {
    constructor(
      readonly origin: string,
      private identity: CloudIdentity,
    ) {}
    get(path: string) {
      return mockGet(this.identity.profileId, path, this.origin);
    }
    async headers() {
      return {};
    }
    revoke() {
      mockRevoke(this.origin);
      return Promise.resolve();
    }
  },
}));
jest.mock('expo/fetch', () => ({ fetch: (...args: unknown[]) => mockInference(...args) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '018f47a2-7d3b-7c91-b8f5-8b3f4c6d2a10' }));
jest.mock('@/backend/utils/defaultAppHeaders', () => ({ defaultAppHeaders: () => ({}) }));
jest.mock('@/backend/data/dataApiChanges', () => ({ publishDataApiChanges: jest.fn() }));

function reply(account: string, path: string) {
  const state = cloudSnapshot(account);
  if (path === '/api/v1/account') return state.account;
  if (path === '/api/v1/account/plans') return state.plans;
  return { data: state.models };
}

function changeAppState(status: AppStateStatus): void {
  AppState.currentState = status;
  for (const listener of appStateListeners) listener(status);
}

const service = {
  apiOrigin: 'https://cloud.example',
  webUrl: 'https://cloud.example/account/plans',
};
const replacementService = {
  apiOrigin: 'https://replacement.example',
  webUrl: 'https://replacement.example/account/plans',
};

async function setup(configuration: Pick<CloudIdentity, 'apiOrigin' | 'webUrl'> | null = service) {
  let identity: CloudIdentity | null =
    configuration === null ? null : { key: 'a', profileId: 'account-a', ...configuration };
  let changed: () => void = () => {};
  const source = {
    getIdentity: () => identity,
    getTokens: async () => ({ accessToken: '', idToken: '' }),
    refreshServices: (key: string, signal: AbortSignal) => mockRefreshServices(key, signal),
    subscribe: (listener: () => void) => {
      changed = listener;
      return () => {};
    },
  };
  const db = {
    withWriteTx: (write: (tx: unknown) => Promise<unknown>) => write({}),
  } as unknown as DbService;
  const runtime = new CloudRuntime(db);
  runtime.configure(source, '0.5.1');
  await runtime._doInit();
  await runtime._doAllReady();
  return {
    runtime,
    change(next: CloudIdentity | null) {
      identity = next;
      changed();
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  AppState.currentState = 'active';
  appStateListeners.clear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListeners.add(listener);
    return {
      remove: () => {
        appStateListeners.delete(listener);
      },
    };
  });
  mockGet
    .mockReset()
    .mockImplementation(async (account: string, path: string) => reply(account, path));
  mockProject.mockClear();
  mockRevoke.mockClear();
  mockInference.mockReset();
  mockRefreshServices.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('account replacement immediately clears state and drops late responses even when cancellation is ignored', async () => {
  let finish!: (value: unknown) => void;
  mockGet.mockImplementation((account: string, path: string) =>
    account === 'account-a' && path === '/api/v1/account'
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(reply(account, path)),
  );
  const { runtime, change } = await setup();
  const previous = runtime.refresh().catch(() => {});
  change({ key: 'b', profileId: 'account-b', ...service });
  expect(runtime.getState()).toMatchObject({ account: null, plans: null, models: [] });
  await runtime.refresh();
  expect(runtime.getState().account?.account.id).toBe('account-b');
  finish(cloudSnapshot('account-a').account);
  await previous;
  expect(runtime.getState().account?.account.id).toBe('account-b');
  await runtime._doStop();
});

test('sign-out removes grants and invalidates previously resolved transports after sign-out', async () => {
  const { runtime, change } = await setup();
  await runtime.refresh();
  const fetch = runtime.createModelFetch('cloud-model', 'agent');
  change(null);
  expect(runtime.getState()).toMatchObject({
    phase: 'signed_out',
    account: null,
    models: [],
    webUrl: null,
  });
  await expect(
    fetch('https://cloud.example/v1/messages', { method: 'POST', body: '{}' }),
  ).rejects.toBeDefined();
  await runtime._doStop();
});

test('service address replacement switches API and webpage together, cancels old inference and drops late reads', async () => {
  const { runtime, change } = await setup();
  await runtime.refresh();
  const previousFetch = runtime.createModelFetch('cloud-model', 'agent');
  let finish!: (value: unknown) => void;
  let started!: () => void;
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  mockGet.mockImplementation((account: string, path: string, origin: string) =>
    origin === service.apiOrigin && path === '/api/v1/account'
      ? new Promise((resolve) => {
          finish = resolve;
          started();
        })
      : Promise.resolve(reply(account, path)),
  );
  const previous = runtime.refresh().catch(() => {});
  await reading;
  change({ key: 'a', profileId: 'account-a', ...replacementService });
  expect(runtime.getState()).toMatchObject({
    account: null,
    plans: null,
    models: [],
    webUrl: replacementService.webUrl,
  });
  expect(mockRevoke).toHaveBeenCalledWith(service.apiOrigin);
  await expect(previousFetch('https://cloud.example/v1/messages')).rejects.toBeDefined();
  await runtime.refresh();
  expect(mockGet).toHaveBeenCalledWith(
    'account-a',
    '/api/v1/account',
    replacementService.apiOrigin,
  );
  expect(mockProject).toHaveBeenLastCalledWith(
    expect.anything(),
    replacementService.apiOrigin,
    expect.any(Array),
    expect.any(Function),
  );
  const current = runtime.getState();
  finish(cloudSnapshot().account);
  await previous;
  expect(runtime.getState()).toBe(current);
  await runtime._doStop();
});

test.each([
  { apiOrigin: undefined, webUrl: replacementService.webUrl },
  { apiOrigin: 'http://replacement.example', webUrl: replacementService.webUrl },
  { apiOrigin: 'https://replacement.example/api', webUrl: replacementService.webUrl },
  { apiOrigin: replacementService.apiOrigin, webUrl: 'https://user:pass@replacement.example' },
])(
  'missing or invalid service addresses cannot reuse the previous API or webpage: %j',
  async (configuration) => {
    const { runtime, change } = await setup();
    await runtime.refresh();
    mockGet.mockClear();
    change({ key: 'a', profileId: 'account-a', ...configuration });
    await expect(runtime.refresh()).rejects.toMatchObject({ code: 'cloud_unavailable' });
    expect(mockGet).not.toHaveBeenCalled();
    expect(runtime.getState()).toMatchObject({
      phase: 'error',
      account: null,
      models: [],
      webUrl: null,
    });
    await runtime._doStop();
  },
);

test('a subscription API can supply models without a management webpage', async () => {
  const { runtime } = await setup({ apiOrigin: service.apiOrigin });
  await runtime.refresh();
  expect(runtime.getState()).toMatchObject({ phase: 'ready', webUrl: null });
  expect(runtime.getState().models).toHaveLength(1);
  await runtime._doStop();
});

test.each(['paid', 'unsubscribed', 'failed'])(
  'cold start checks once when %s, without foreground checks, polling or automatic retries',
  async (result) => {
    mockGet.mockImplementation(async (account: string, path: string) => {
      if (result === 'failed') throw new Error('offline');
      if (path !== '/api/v1/account') return reply(account, path);
      const data = cloudSnapshot(account).account!;
      return result === 'unsubscribed' ? { ...data, entitlements: [] } : data;
    });
    const { runtime } = await setup();
    await jest.advanceTimersByTimeAsync(0);
    expect(mockGet).toHaveBeenCalledTimes(3);
    expect(runtime.getState()).toMatchObject({
      phase: result === 'failed' ? 'error' : 'ready',
      isRefreshing: false,
    });
    changeAppState('inactive');
    changeAppState('active');
    changeAppState('background');
    changeAppState('active');
    await jest.advanceTimersByTimeAsync(120_000);
    expect(mockGet).toHaveBeenCalledTimes(3);
    await runtime._doStop();
  },
);

test('cold start waits for account restoration and ignores repeated identity notifications', async () => {
  const { runtime, change } = await setup(null);
  await jest.advanceTimersByTimeAsync(0);
  expect(mockGet).not.toHaveBeenCalled();
  const identity = { key: 'a', profileId: 'account-a', ...service };
  change(identity);
  change({ ...identity });
  await jest.advanceTimersByTimeAsync(0);
  expect(runtime.getState().phase).toBe('ready');
  change({ ...identity });
  await jest.advanceTimersByTimeAsync(120_000);
  expect(mockGet).toHaveBeenCalledTimes(3);
  await runtime._doStop();
});

test('a new cold-start runtime checks the same saved account again', async () => {
  const first = await setup();
  await jest.advanceTimersByTimeAsync(0);
  expect(mockGet).toHaveBeenCalledTimes(3);
  await first.runtime._doStop();
  const second = await setup();
  await jest.advanceTimersByTimeAsync(0);
  expect(mockGet).toHaveBeenCalledTimes(6);
  await second.runtime._doStop();
});

test('cold-start discovery recovers missing metadata before one subscription check', async () => {
  let finish!: () => void;
  mockRefreshServices.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const { runtime, change } = await setup({});
  expect(mockRefreshServices).toHaveBeenCalledTimes(1);
  expect(mockGet).not.toHaveBeenCalled();
  change({ key: 'a', profileId: 'account-a', ...service });
  finish();
  await jest.advanceTimersByTimeAsync(0);
  expect(runtime.getState()).toMatchObject({ phase: 'ready' });
  expect(mockGet).toHaveBeenCalledTimes(3);
  expect(mockProject.mock.lastCall?.[2]).toHaveLength(1);
  await runtime._doStop();
});

test('inference completion defers entitlement revalidation until the next model request', async () => {
  mockInference.mockImplementation(async () => new Response(null, { status: 200 }));
  const { runtime } = await setup();
  await jest.advanceTimersByTimeAsync(0);
  const send = runtime.createModelFetch('cloud-model', 'agent');
  const request = () =>
    send('https://cloud.example/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'cloud-model' }),
    });
  await request();
  await jest.advanceTimersByTimeAsync(120_000);
  expect(mockGet).toHaveBeenCalledTimes(3);
  await request();
  expect(mockGet).toHaveBeenCalledTimes(6);
  await runtime._doStop();
});

test('healthy configured subscription reads do not wait for configuration rediscovery', async () => {
  mockRefreshServices.mockImplementation(() => new Promise(() => {}));
  const { runtime } = await setup();
  await runtime.refresh();
  expect(runtime.getState().phase).toBe('ready');
  expect(mockRefreshServices).not.toHaveBeenCalled();
  await runtime._doStop();
});

test('a failed read can recover through the configured service even if rediscovery is unavailable', async () => {
  const { runtime } = await setup();
  await runtime.refresh();
  mockGet.mockRejectedValueOnce(new Error('temporary read failure'));
  await expect(runtime.refresh()).rejects.toThrow('temporary read failure');
  mockRefreshServices.mockRejectedValue(new Error('config service offline'));
  await runtime.refresh();
  expect(runtime.getState().phase).toBe('ready');
  await runtime._doStop();
});

test('an outage keeps display data but fails closed, and unchanged refreshes do not rewrite the catalog', async () => {
  const { runtime } = await setup();
  await runtime.refresh();
  const previous: CloudState = runtime.getState();
  const projected = mockProject.mock.calls.filter(
    (call) => (call[2] as CloudModel[]).length > 0,
  ).length;
  await runtime.refresh();
  expect(
    mockProject.mock.calls.filter((call) => (call[2] as CloudModel[]).length > 0),
  ).toHaveLength(projected);
  mockGet.mockRejectedValue(new Error('offline'));
  await expect(runtime.refresh()).rejects.toThrow('offline');
  expect(runtime.getState()).toMatchObject({
    phase: 'error',
    account: previous.account,
    plans: previous.plans,
  });
  await runtime._doStop();
});

test('catalog withdrawal resumes after a backup freeze without restoring signed-out access', async () => {
  const { runtime, change } = await setup();
  await runtime.refresh();
  const release = storageMutationGate.freeze();
  try {
    change(null);
    await expect(runtime.refresh()).rejects.toBeDefined();
    expect(runtime.getState().phase).toBe('signed_out');
  } finally {
    release();
  }
  await runtime.refresh();
  expect(mockProject.mock.lastCall?.[2]).toEqual([]);
  expect(runtime.getState().phase).toBe('signed_out');
  await runtime._doStop();
});

test('Plan models appear only while the account has a paid subscription', async () => {
  let subscribed = false;
  mockGet.mockImplementation(async (account: string, path: string) => {
    if (path !== '/api/v1/account') return reply(account, path);
    const snapshot = cloudSnapshot(account).account!;
    snapshot.entitlements[0].is_free = !subscribed;
    return snapshot;
  });
  const { runtime } = await setup();
  await runtime.refresh();
  expect(mockProject.mock.lastCall?.[2]).toEqual([]);
  const fetch = runtime.createModelFetch('cloud-model', 'agent');
  await expect(
    fetch('https://cloud.example/v1/messages', { method: 'POST', body: '{}' }),
  ).rejects.toMatchObject({ code: 'cloud_not_entitled' });

  subscribed = true;
  await runtime.refresh();
  expect(mockProject.mock.lastCall?.[2]).toEqual(cloudSnapshot().models);

  subscribed = false;
  await runtime.refresh();
  expect(mockProject.mock.lastCall?.[2]).toEqual([]);
  await runtime._doStop();
});

test('quota exhaustion rejects a previously selected model before requesting inference', async () => {
  const { runtime } = await setup();
  await runtime.refresh();
  const fetch = runtime.createModelFetch('cloud-model', 'agent');
  mockGet.mockImplementation(async (account: string, path: string) => {
    if (path !== '/api/v1/account') return reply(account, path);
    const snapshot = cloudSnapshot(account).account!;
    snapshot.quota_pools[0].windows[0].remaining_units = 0;
    return snapshot;
  });
  await runtime.refresh();
  await expect(
    fetch('https://cloud.example/v1/messages', { method: 'POST', body: '{}' }),
  ).rejects.toMatchObject({ code: 'cloud_quota_exhausted' });
  await runtime._doStop();
});
