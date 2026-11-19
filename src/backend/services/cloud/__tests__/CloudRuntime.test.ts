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

test('background refresh publishes new quota silently and coalesces concurrent reads', async () => {
  const { runtime } = await setup();
  await jest.advanceTimersByTimeAsync(0);
  mockGet.mockClear();
  const account = cloudSnapshot().account!;
  account.quota_pools[0]!.windows[0]!.remaining_units = 500;
  mockGet.mockImplementation(async (id: string, path: string) =>
    path === '/api/v1/account' ? account : reply(id, path),
  );

  const first = runtime.refresh('background');
  const second = runtime.refresh('background');
  expect(runtime.getState().isRefreshing).toBe(false);
  await Promise.all([first, second]);
  expect(runtime.getState().account).toEqual(account);
  expect(mockGet.mock.calls.filter(([, path]) => path === '/api/v1/account')).toHaveLength(1);

  await runtime.refresh('if-stale');
  expect(mockGet.mock.calls.filter(([, path]) => path === '/api/v1/account')).toHaveLength(1);
  await jest.advanceTimersByTimeAsync(31_000);
  await runtime.refresh('if-stale');
  expect(mockGet.mock.calls.filter(([, path]) => path === '/api/v1/account')).toHaveLength(2);
  await runtime._doStop();
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

test('reuses recently verified model access across requests and revalidates it when stale', async () => {
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
  await request();
  expect(mockGet).toHaveBeenCalledTimes(3);
  await jest.advanceTimersByTimeAsync(120_000);
  expect(mockGet).toHaveBeenCalledTimes(3);
  await request();
  expect(mockGet).toHaveBeenCalledTimes(5);
  await runtime._doStop();
});

test('an older background read cannot block sending or mark displayed quota fresh', async () => {
  const upstream = inferenceResponse();
  mockInference
    .mockResolvedValueOnce(upstream.response)
    .mockImplementation(async () => new Response(null, { status: 200 }));
  const { runtime } = await setup();
  await jest.advanceTimersByTimeAsync(0);
  const send = runtime.createModelFetch('cloud-model', 'agent');
  const request = () =>
    send('https://cloud.example/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'cloud-model' }),
    });
  const response = await request();
  let finishAccount!: (value: unknown) => void;
  mockGet.mockReturnValueOnce(
    new Promise((resolve) => {
      finishAccount = resolve;
    }),
  );
  const background = runtime.refresh('background');
  try {
    await jest.advanceTimersByTimeAsync(0);
    upstream.close();
    await expect(response.body!.getReader().read()).resolves.toMatchObject({ done: true });
    const next = request();
    void next.catch(() => {});
    await jest.advanceTimersByTimeAsync(0);
    const sendsWhileReading = mockInference.mock.calls.length;
    const oldAccount = cloudSnapshot().account!;
    oldAccount.quota_pools[0]!.windows[0]!.remaining_units = 0;
    finishAccount(oldAccount);
    await background;
    await expect(next).resolves.toMatchObject({ status: 200 });
    expect(sendsWhileReading).toBe(2);

    mockGet.mockClear();
    await runtime.refresh('if-stale');
    expect(mockGet).toHaveBeenCalledWith('account-a', '/api/v1/account', service.apiOrigin);
  } finally {
    finishAccount(cloudSnapshot().account);
    await runtime._doStop();
  }
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

test('a failed background catalog read leaves a send using recently verified access intact', async () => {
  const { runtime } = await setup();
  await jest.advanceTimersByTimeAsync(0);
  let finishSigning!: (headers: Record<string, string>) => void;
  mockClientSignatureHeaders.mockReturnValueOnce(
    new Promise((resolve) => {
      finishSigning = resolve;
    }),
  );
  const response = new Response(null, { status: 200 });
  mockInference.mockResolvedValue(response);
  const send = runtime.createModelFetch('cloud-model', 'agent')(
    'https://cloud.example/v1/messages',
    {
      method: 'POST',
      body: JSON.stringify({ model: 'cloud-model' }),
    },
  );
  try {
    await jest.advanceTimersByTimeAsync(0);
    mockGet.mockImplementation(async (id: string, path: string) => {
      if (path === '/v1/models') throw new Error('Catalog unavailable');
      return reply(id, path);
    });
    await expect(runtime.refresh('background')).rejects.toThrow('Catalog unavailable');
    finishSigning({});
    await expect(send).resolves.toBe(response);
    expect(runtime.getState().phase).toBe('ready');
  } finally {
    finishSigning({});
    await runtime._doStop();
  }
});

test('an in-flight network read allows a backup freeze and applies catalog changes after thaw', async () => {
  const { runtime } = await setup();
  await jest.advanceTimersByTimeAsync(0);
  mockProject.mockClear();
  let finishModels!: (value: unknown) => void;
  const pendingModels = new Promise((resolve) => {
    finishModels = resolve;
  });
  mockGet.mockImplementation(async (id: string, path: string) =>
    path === '/v1/models' ? pendingModels : reply(id, path),
  );
  const background = runtime.refresh('background');
  const models = cloudSnapshot().models.map((model) => ({ ...model, display_name: 'New name' }));
  const release = storageMutationGate.freeze();
  try {
    await jest.advanceTimersByTimeAsync(0);
    expect(runtime.hasPendingStorageWork()).toBe(false);
    finishModels({ data: models });
    await jest.advanceTimersByTimeAsync(0);
    expect(mockProject).not.toHaveBeenCalled();
  } finally {
    finishModels({ data: models });
    release();
    await background;
    await runtime._doStop();
  }
  expect(mockProject.mock.lastCall?.[2]).toEqual(models);
});

test('catalog withdrawal waits for a backup freeze to end without restoring signed-out access', async () => {
  const { runtime, change } = await setup();
  await runtime.refresh();
  mockProject.mockClear();
  const release = storageMutationGate.freeze();
  change(null);
  const withdrawal = runtime.refresh();
  try {
    await jest.advanceTimersByTimeAsync(0);
    expect(runtime.getState().phase).toBe('signed_out');
    expect(mockProject).not.toHaveBeenCalled();
  } finally {
    release();
  }
  await withdrawal;
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

test('forwards the server quota refusal even when the local snapshot already shows zero quota', async () => {
  const refusal = new Response(JSON.stringify({ error: { message: 'Quota exhausted' } }), {
    status: 429,
  });
  mockInference.mockResolvedValue(refusal);
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
    fetch('https://cloud.example/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'cloud-model' }),
    }),
  ).resolves.toBe(refusal);
  expect(runtime.getState().phase).toBe('ready');
  await runtime._doStop();
});
