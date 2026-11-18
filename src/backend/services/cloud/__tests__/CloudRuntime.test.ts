import { ReadableStream, type ReadableStreamDefaultController } from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';

import { AppState, type AppStateStatus } from 'react-native';

import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import type { DbService } from '@/backend/data/db/DbService';
import type { CloudModel, CloudState } from '@/shared/contracts/cloud';

import { CloudRuntime } from '../CloudRuntime';
import type { CloudIdentity } from '../CloudSession';
import { cloudSnapshot } from './_cloudFixtures';

const mockGet = jest.fn();
const mockPostEmpty = jest.fn();
const mockRevoke = jest.fn();
const mockInference = jest.fn();
const mockHeaders = jest.fn();
const mockIdempotencyKey = jest.fn();
const mockClientSignatureHeaders = jest.fn();
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
jest.mock('../cloudDevice', () => ({
  createCloudIdempotencyKey: () => mockIdempotencyKey(),
  loadCloudDevice: async () => ({}),
}));
jest.mock('../cloudClientSignature', () => ({
  cloudClientSignatureHeaders: (...args: unknown[]) => mockClientSignatureHeaders(...args),
}));
jest.mock('../projectCloudModels', () => ({
  projectCloudModels: (...args: Parameters<typeof mockProject>) => mockProject(...args),
}));
jest.mock('../CloudSession', () => ({
  CloudSession: class {
    readonly origin: string;
    private readonly identity: CloudIdentity;
    constructor(origin: string, identity: CloudIdentity) {
      this.origin = origin;
      this.identity = identity;
    }
    get(path: string) {
      return mockGet(this.identity.profileId, path, this.origin);
    }
    postEmpty(path: string) {
      return mockPostEmpty(this.identity.profileId, path, this.origin);
    }
    async headers(...args: unknown[]) {
      return mockHeaders(...args);
    }
    revoke() {
      mockRevoke(this.origin);
      return Promise.resolve();
    }
  },
}));
jest.mock('expo/fetch', () => ({ fetch: (...args: unknown[]) => mockInference(...args) }));
jest.mock('@/backend/utils/defaultAppHeaders', () => ({ defaultAppHeaders: () => ({}) }));
jest.mock('@/backend/data/dataApiChanges', () => ({ publishDataApiChanges: jest.fn() }));

function reply(account: string, path: string) {
  const state = cloudSnapshot(account);
  if (path === '/api/v1/account') return state.account;
  if (path === '/api/v1/account/plans') return state.plans;
  if (path === '/v1/models') return { data: state.models };
  throw new Error(`Unexpected Cloud endpoint: ${path}`);
}

function changeAppState(status: AppStateStatus): void {
  AppState.currentState = status;
  for (const listener of appStateListeners) listener(status);
}

const service = {
  apiOrigin: 'https://cloud.example',
};
const replacementService = {
  apiOrigin: 'https://replacement.example',
};

function inferenceResponse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const cancel = jest.fn();
  const source = new ReadableStream<Uint8Array>(
    {
      start(value) {
        controller = value;
      },
      cancel,
    },
    { highWaterMark: 0 },
  );
  // Expo supplies a native body even though RN's global Response cannot construct one.
  const response = new Response(null, { headers: { 'content-type': 'text/event-stream' } });
  Object.defineProperty(response, 'body', { configurable: true, value: source });
  return {
    response,
    source,
    cancel,
    push: (text: string) => controller.enqueue(new TextEncoder().encode(text)),
    close: () => controller.close(),
  };
}

const originalStreamingGlobals = {
  ReadableStream: globalThis.ReadableStream,
  TextDecoder: globalThis.TextDecoder,
  TextEncoder: globalThis.TextEncoder,
};
beforeAll(() => {
  Object.assign(globalThis, { ReadableStream, TextDecoder, TextEncoder });
});
afterAll(() => {
  Object.assign(globalThis, originalStreamingGlobals);
});

async function setup(configuration: Pick<CloudIdentity, 'apiOrigin'> | null = service) {
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
  mockPostEmpty.mockReset();
  mockRevoke.mockClear();
  mockInference.mockReset();
  mockHeaders
    .mockReset()
    .mockImplementation(async (_method, _path, _body, key) => ({ 'Idempotency-Key': key }));
  mockIdempotencyKey.mockReset().mockReturnValue('AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8');
  mockClientSignatureHeaders.mockReset().mockResolvedValue({});
  mockRefreshServices.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('keeps Cloud cancellation linked after streaming headers arrive', async () => {
  const upstream = inferenceResponse();
  mockInference.mockResolvedValue(upstream.response);
  const { runtime, change } = await setup();
  try {
    await runtime.refresh();
    const response = await runtime.createModelFetch('cloud-model', 'agent')(
      'https://cloud.example/v1/messages',
      {
        method: 'POST',
        body: JSON.stringify({ model: 'cloud-model', stream: true }),
      },
    );
    expect(response).toBe(upstream.response);
    expect(upstream.source.locked).toBe(false);
    change(null);
    expect(mockInference.mock.lastCall![1].signal.aborted).toBe(true);
    await expect(response.body!.getReader().read()).rejects.toBeDefined();
  } finally {
    await runtime._doStop();
  }
});

test('cancels an unread stream and releases the old account lifetime', async () => {
  const upstream = inferenceResponse();
  mockInference.mockResolvedValue(upstream.response);
  const { runtime, change } = await setup();
  try {
    await runtime.refresh();
    const response = await runtime.createModelFetch('cloud-model', 'agent')(
      'https://cloud.example/v1/messages',
      {
        method: 'POST',
        body: JSON.stringify({ model: 'cloud-model', stream: true }),
      },
    );
    await response.body!.cancel('stop');
    expect(upstream.cancel).toHaveBeenCalledWith('stop');
    expect(upstream.source.locked).toBe(false);
    change(null);
    expect(mockInference.mock.lastCall![1].signal.aborted).toBe(false);
  } finally {
    await runtime._doStop();
  }
});

test('consumes non-streaming responses before releasing their account lifetime', async () => {
  const upstream = inferenceResponse();
  const payload = { choices: [{ message: { role: 'assistant', content: '你好' } }] };
  upstream.response.headers.set('content-type', 'application/json');
  upstream.push(JSON.stringify(payload));
  upstream.close();
  mockInference.mockResolvedValue(upstream.response);
  const { runtime, change } = await setup();
  try {
    await runtime.refresh();
    const response = await runtime.createModelFetch('cloud-model', 'general')(
      'https://cloud.example/v1/messages',
      {
        method: 'POST',
        body: JSON.stringify({ model: 'cloud-model', stream: false }),
      },
    );
    expect(response).toBe(upstream.response);
    const reader = response.body!.getReader();
    const chunk = await reader.read();
    expect(JSON.parse(new TextDecoder().decode(chunk.value))).toEqual(payload);
    expect((await reader.read()).done).toBe(true);
    reader.releaseLock();
    expect(upstream.source.locked).toBe(false);
    change(null);
    expect(mockInference.mock.lastCall![1].signal.aborted).toBe(false);
  } finally {
    await runtime._doStop();
  }
});

test.each([
  ['anthropic-messages', '/v1/messages', '', 'agent'],
  ['anthropic-messages', '/v1/messages', '', 'general'],
  ['anthropic-messages', '/v1/messages', '?beta=true', 'agent'],
  ['openai-chat-completions', '/v1/chat/completions', '', 'agent'],
  ['openai-chat-completions', '/v1/chat/completions', '', 'general'],
] as const)(
  'sends device and application signatures for %s at %s%s with %s use',
  async (endpoint, path, query, use) => {
    mockClientSignatureHeaders.mockResolvedValue({
      'X-Client-ID': 'cherry-studio',
      'X-Timestamp': '1710000000',
      'X-Signature': 'native-cloud-signature',
    });
    mockHeaders.mockImplementation(async (_method, _path, _body, key) => ({
      authorization: 'Bearer product-session',
      'Cherry-Signature': 'device-signature',
      'Idempotency-Key': key,
    }));
    mockGet.mockImplementation(async (account: string, resource: string) => {
      if (resource !== '/v1/models') return reply(account, resource);
      return {
        data: cloudSnapshot(account).models.map((model) => ({ ...model, endpoint_type: endpoint })),
      };
    });
    mockInference.mockImplementation(async () => new Response(null, { status: 200 }));
    const keys = [
      'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
      '__________________________________________8',
    ];
    mockIdempotencyKey.mockReturnValueOnce(keys[0]).mockReturnValueOnce(keys[1]);
    const { runtime } = await setup();
    try {
      await runtime.refresh();
      expect(mockClientSignatureHeaders).not.toHaveBeenCalled();
      const send = runtime.createModelFetch('cloud-model', use);
      const body = JSON.stringify({
        model: 'cloud-model',
        max_tokens: 64,
        messages: [{ role: 'user', content: '你好' }],
      });
      for (const key of keys) {
        await expect(
          send(`https://cloud.example${path}${query}`, {
            method: 'POST',
            body,
            headers: {
              'Idempotency-Key': 'caller-supplied-key',
              'X-Signature': 'caller-supplied-signature',
              ...(endpoint === 'anthropic-messages' ? { 'anthropic-version': '2023-06-01' } : {}),
            },
          }),
        ).resolves.toMatchObject({ status: 200 });
        const [url, init] = mockInference.mock.lastCall!;
        expect(url).toBe(`https://cloud.example${path}`);
        expect(init.body).toBe(body);
        expect(init.headers.get('Idempotency-Key')).toBe(key);
        expect(init.headers.get('Idempotency-Key')).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(mockHeaders).toHaveBeenLastCalledWith('POST', path, body, key);
        expect(mockClientSignatureHeaders).toHaveBeenLastCalledWith('POST', path, body);
        expect(init.headers.get('X-Client-ID')).toBe('cherry-studio');
        expect(init.headers.get('X-Timestamp')).toBe('1710000000');
        expect(init.headers.get('X-Signature')).toBe('native-cloud-signature');
        expect(init.headers.get('Authorization')).toBe('Bearer product-session');
        expect(init.headers.get('Cherry-Signature')).toBe('device-signature');
      }
    } finally {
      await runtime._doStop();
    }
  },
);

test.each([
  ['anthropic-messages', 'https://other.example/v1/messages'],
  ['anthropic-messages', 'https://cloud.example/v1/messages?beta=false'],
  ['anthropic-messages', 'https://cloud.example/v1/messages?beta=true&extra=1'],
  ['anthropic-messages', 'https://cloud.example/v1/messages?beta=true&beta=true'],
  ['openai-chat-completions', 'https://cloud.example/v1/chat/completions?beta=true'],
] as const)('does not sign or send an unsupported %s request at %s', async (endpoint, url) => {
  mockGet.mockImplementation(async (account: string, resource: string) =>
    resource === '/v1/models'
      ? {
          data: cloudSnapshot(account).models.map((model) => ({
            ...model,
            endpoint_type: endpoint,
          })),
        }
      : reply(account, resource),
  );
  const { runtime } = await setup();
  try {
    await runtime.refresh();
    await expect(
      runtime.createModelFetch('cloud-model', 'agent')(url, {
        method: 'POST',
        body: JSON.stringify({ model: 'cloud-model' }),
      }),
    ).rejects.toMatchObject({ code: 'cloud_unavailable' });
    expect(mockClientSignatureHeaders).not.toHaveBeenCalled();
    expect(mockInference).not.toHaveBeenCalled();
  } finally {
    await runtime._doStop();
  }
});

test('does not send an inference request when configured application signing fails', async () => {
  mockClientSignatureHeaders.mockRejectedValue(new Error('Native signing failed'));
  const { runtime } = await setup();
  try {
    await runtime.refresh();
    await expect(
      runtime.createModelFetch('cloud-model', 'agent')('https://cloud.example/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ model: 'cloud-model' }),
      }),
    ).rejects.toThrow('Native signing failed');
    expect(mockInference).not.toHaveBeenCalled();
  } finally {
    await runtime._doStop();
  }
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
  expect(runtime.getState()).toMatchObject({ account: null, models: [] });
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
  });
  await expect(
    fetch('https://cloud.example/v1/messages', { method: 'POST', body: '{}' }),
  ).rejects.toBeDefined();
  await runtime._doStop();
});

test('service address replacement switches API, cancels old inference and drops late reads', async () => {
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
    models: [],
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
  { apiOrigin: undefined },
  { apiOrigin: 'http://replacement.example' },
  { apiOrigin: 'https://replacement.example/api' },
])(
  'missing or invalid service addresses cannot reuse the previous API: %j',
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
    });
    await runtime._doStop();
  },
);

test.each(['unavailable', 'invalid'])(
  'plan display metadata being %s does not reject model admission',
  async (failure) => {
    mockGet.mockImplementation(async (account: string, path: string) => {
      if (path !== '/api/v1/account/plans') return reply(account, path);
      if (failure === 'unavailable') throw new Error('Plan endpoint unavailable');
      return { invalid: true };
    });
    mockInference.mockImplementation(async () => new Response(null, { status: 200 }));
    const { runtime } = await setup();
    await runtime.refresh();
    await jest.advanceTimersByTimeAsync(0);
    expect(runtime.getState()).toMatchObject({ phase: 'ready', plans: null });
    expect(runtime.getState().models).toHaveLength(1);
    const send = runtime.createModelFetch('cloud-model', 'agent');
    await expect(
      send('https://cloud.example/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ model: 'cloud-model' }),
      }),
    ).resolves.toMatchObject({ status: 200 });
    await runtime._doStop();
  },
);

test('pending plan metadata does not delay readiness or inference and is published when it arrives', async () => {
  let finishPlans!: (value: unknown) => void;
  const pendingPlans = new Promise((resolve) => {
    finishPlans = resolve;
  });
  mockGet.mockImplementation(async (account: string, path: string) =>
    path === '/api/v1/account/plans' ? pendingPlans : reply(account, path),
  );
  mockInference.mockImplementation(async () => new Response(null, { status: 200 }));
  const { runtime } = await setup();
  let ready = false;
  const refresh = runtime.refresh().then(() => {
    ready = true;
  });
  try {
    await jest.advanceTimersByTimeAsync(0);
    expect(ready).toBe(true);
    expect(runtime.getState()).toMatchObject({ phase: 'ready', plans: null });
    const send = runtime.createModelFetch('cloud-model', 'agent');
    await expect(
      send('https://cloud.example/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ model: 'cloud-model' }),
      }),
    ).resolves.toMatchObject({ status: 200 });
    finishPlans(cloudSnapshot().plans);
    await jest.advanceTimersByTimeAsync(0);
    expect(runtime.getState().plans).toEqual(cloudSnapshot().plans);
  } finally {
    finishPlans(cloudSnapshot().plans);
    await refresh;
    await runtime._doStop();
  }
});

test('late plan metadata from a replaced account cannot overwrite the current display', async () => {
  let finishPlans!: (value: unknown) => void;
  const pendingPlans = new Promise((resolve) => {
    finishPlans = resolve;
  });
  mockGet.mockImplementation(async (account: string, path: string) =>
    account === 'account-a' && path === '/api/v1/account/plans'
      ? pendingPlans
      : reply(account, path),
  );
  const { runtime, change } = await setup();
  try {
    await runtime.refresh();
    change({ key: 'b', profileId: 'account-b', ...service });
    await runtime.refresh();
    await jest.advanceTimersByTimeAsync(0);
    const current = runtime.getState().plans;
    expect(current).toEqual(cloudSnapshot('account-b').plans);
    finishPlans({ ...cloudSnapshot().plans, measured_at: '2026-01-01T00:00:00Z' });
    await jest.advanceTimersByTimeAsync(0);
    expect(runtime.getState().account?.account.id).toBe('account-b');
    expect(runtime.getState().plans).toEqual(current);
  } finally {
    finishPlans(cloudSnapshot().plans);
    await runtime._doStop();
  }
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
    expect(mockGet).toHaveBeenCalledTimes(result === 'paid' ? 3 : 2);
    expect(runtime.getState()).toMatchObject({
      phase: result === 'failed' ? 'error' : 'ready',
      isRefreshing: false,
    });
    changeAppState('inactive');
    changeAppState('active');
    changeAppState('background');
    changeAppState('active');
    await jest.advanceTimersByTimeAsync(120_000);
    expect(mockGet).toHaveBeenCalledTimes(result === 'paid' ? 3 : 2);
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
  expect(mockGet).toHaveBeenCalledTimes(5);
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

test('a free plan projects models only while its entitlement is active', async () => {
  let status: 'active' | 'inactive' = 'inactive';
  mockGet.mockImplementation(async (account: string, path: string) => {
    if (path !== '/api/v1/account') return reply(account, path);
    const snapshot = cloudSnapshot(account).account!;
    snapshot.entitlements[0].is_free = true;
    snapshot.entitlements[0].status = status;
    return snapshot;
  });
  const { runtime } = await setup();
  await runtime.refresh();
  expect(mockProject.mock.lastCall?.[2]).toEqual([]);
  const fetch = runtime.createModelFetch('cloud-model', 'agent');
  await expect(
    fetch('https://cloud.example/v1/messages', { method: 'POST', body: '{}' }),
  ).rejects.toMatchObject({ code: 'cloud_not_entitled' });

  status = 'active';
  await runtime.refresh();
  expect(mockProject.mock.lastCall?.[2]).toEqual(cloudSnapshot().models);

  status = 'inactive';
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

test('uses the AMD catalog activation flag instead of a paid entitlement and preserves the key on replay', async () => {
  const model: CloudModel = {
    ...cloudSnapshot().models[0],
    id: 'amd/free-model',
    provider: 'amd',
    endpoint_type: 'openai-chat-completions',
  };
  let activationRequired = true;
  mockGet.mockImplementation(async (account: string, path: string) => {
    if (path === '/v1/models')
      return { data: [{ ...model, activation_required: activationRequired }] };
    if (path === '/api/v1/account')
      return { ...cloudSnapshot(account).account, entitlements: [], quota_pools: [] };
    return reply(account, path);
  });
  const { runtime } = await setup();
  try {
    await runtime.refresh();
    const fetch = runtime.createModelFetch(model.id, 'agent');
    const request = () =>
      fetch('https://cloud.example/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model: model.id }),
      });
    await expect(request()).rejects.toMatchObject({ code: 'cloud_amd_activation_required' });
    expect(mockInference).not.toHaveBeenCalled();

    activationRequired = false;
    await runtime.refresh();
    expect(mockProject.mock.lastCall?.[2]).toEqual([{ ...model, activation_required: false }]);
    mockInference
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'REQUEST_REPLAYED' } }), { status: 409 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(request()).resolves.toMatchObject({ status: 200 });
    expect(mockHeaders).toHaveBeenCalledTimes(2);
    expect(mockIdempotencyKey).toHaveBeenCalledTimes(1);
    expect(mockHeaders.mock.calls[1][3]).toBe(mockHeaders.mock.calls[0][3]);
  } finally {
    await runtime._doStop();
  }
});

test('links existing AMD accounts and opens the usage page while registration is closed', async () => {
  let status = { status: 'unregistered', action: 'login', activated: false, environment: 'test' };
  mockGet.mockImplementation(async (account: string, path: string) =>
    path === '/api/v1/amd/desktop/status' ? status : reply(account, path),
  );
  const entry = 'https://public-cloud.example/amd/enter#one-use-entry';
  mockPostEmpty.mockResolvedValue({ entry_url: entry, expires_in: 60 });
  const { runtime, change } = await setup();
  try {
    await runtime.refreshAmd();
    expect(runtime.getState().amd).toEqual({
      phase: 'ready',
      status: { ...status, registration_enabled: false },
    });
    expect(mockPostEmpty).not.toHaveBeenCalled();
    await expect(runtime.createAmdEntry()).resolves.toBe(entry);
    expect(mockPostEmpty).toHaveBeenCalledWith(
      'account-a',
      '/api/v1/amd/desktop/entry',
      service.apiOrigin,
    );
    status = { ...status, status: 'registered', action: 'none', activated: true };
    await runtime.refreshAmd();
    await expect(runtime.createAmdEntry()).resolves.toBe(entry);
    change(null);
    expect(runtime.getState().amd).toBeUndefined();
    await expect(runtime.createAmdEntry()).rejects.toMatchObject({ code: 'cloud_unavailable' });
  } finally {
    await runtime._doStop();
  }
});

test('refreshes AMD status and models on return even while pre-activation reads are pending', async () => {
  const model: CloudModel = {
    ...cloudSnapshot().models[0],
    id: 'amd/free-model',
    provider: 'amd',
    endpoint_type: 'openai-chat-completions',
  };
  let activated = false;
  let delayOldReads = false;
  let releaseOldReads!: () => void;
  const oldReads = new Promise<void>((resolve) => {
    releaseOldReads = resolve;
  });
  mockGet.mockImplementation(async (account: string, path: string) => {
    if (path !== '/v1/models' && path !== '/api/v1/amd/desktop/status') return reply(account, path);
    const wasActivated = activated;
    if (delayOldReads && !wasActivated) await oldReads;
    return path === '/v1/models'
      ? { data: [{ ...model, activation_required: !wasActivated }] }
      : {
          status: wasActivated ? 'registered' : 'unregistered',
          action: wasActivated ? 'none' : 'login',
          activated: wasActivated,
          environment: 'test',
        };
  });

  const { runtime } = await setup();
  try {
    await runtime.refreshProvider();
    expect(runtime.getState().amd).toMatchObject({ status: { activated: false } });

    delayOldReads = true;
    const oldRefresh = Promise.all([runtime.refresh(), runtime.refreshAmd()]);
    await jest.advanceTimersByTimeAsync(0);
    activated = true;
    const browserReturn = runtime.refreshProvider();
    releaseOldReads();
    await Promise.all([oldRefresh, browserReturn]);

    expect(runtime.getState().amd).toMatchObject({ status: { activated: true } });
    expect(mockProject.mock.lastCall?.[2]).toEqual([{ ...model, activation_required: false }]);
  } finally {
    releaseOldReads();
    await runtime._doStop();
  }
});
