import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import type { DbService } from '@/backend/data/db/DbService';
import type { CloudModel, CloudState } from '@/shared/contracts/cloud';

import { CloudRuntime } from '../CloudRuntime';
import type { CloudIdentity } from '../CloudSession';
import { cloudSnapshot } from './cloudFixtures';

const mockGet = jest.fn();
const mockProject = jest.fn(
  async (
    _tx: unknown,
    _origin: string,
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
      _origin: string,
      private identity: CloudIdentity,
    ) {}
    get(path: string) {
      return mockGet(this.identity.profileId, path);
    }
    revoke() {
      return Promise.resolve();
    }
  },
}));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('@/backend/utils/defaultAppHeaders', () => ({ defaultAppHeaders: () => ({}) }));
jest.mock('@/backend/data/dataApiChanges', () => ({ publishDataApiChanges: jest.fn() }));

function reply(account: string, path: string) {
  const state = cloudSnapshot(account);
  if (path === '/api/v1/account') return state.account;
  if (path === '/api/v1/account/plans') return state.plans;
  return { data: state.models };
}

async function setup() {
  let identity: CloudIdentity | null = { key: 'a', profileId: 'account-a' };
  let changed: () => void = () => {};
  const source = {
    getIdentity: () => identity,
    getTokens: async () => ({ accessToken: '', idToken: '' }),
    subscribe: (listener: () => void) => {
      changed = listener;
      return () => {};
    },
  };
  const db = {
    withWriteTx: (write: (tx: unknown) => Promise<unknown>) => write({}),
  } as unknown as DbService;
  const runtime = new CloudRuntime(db);
  runtime.configure(source, 'https://cloud.example', '0.5.1');
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
  mockGet
    .mockReset()
    .mockImplementation(async (account: string, path: string) => reply(account, path));
  mockProject.mockClear();
});
afterEach(() => jest.useRealTimers());

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
  change({ key: 'b', profileId: 'account-b' });
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
  expect(runtime.getState()).toMatchObject({ phase: 'signed_out', account: null, models: [] });
  await expect(
    fetch('https://cloud.example/v1/messages', { method: 'POST', body: '{}' }),
  ).rejects.toBeDefined();
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
