import { ReadableStream, type ReadableStreamDefaultController } from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';

import { AppState, type AppStateStatus } from 'react-native';

import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import type { DbService } from '@/backend/data/db/DbService';
import type { CloudModel, CloudState } from '@/shared/contracts/cloud';

import { CloudRuntime } from '../CloudRuntime';
import type { CloudIdentity } from '../CloudSession';
import { cloudSnapshot } from './_cloudFixtures';

const mockPublicRequest = jest.fn();
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
jest.mock('@/backend/services/http', () => ({
  ...jest.requireActual('@/backend/services/http'),
  createHttpClient: () => ({ request: mockPublicRequest }),
}));
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
    recoverRequest(status: number, code: string) {
      return status === 409 && code === 'REQUEST_REPLAYED';
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
  if (path === '/v1/models?limit=1000&catalog=full') return { data: state.models };
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
    getGuestCatalogOrigin: async () => service.apiOrigin,
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
  mockPublicRequest.mockReset();
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

test('bounds a pending header wait even when the native fetch ignores abort', async () => {
  let reject!: (error: Error) => void;
  mockInference.mockImplementation(
    () =>
      new Promise<Response>((_resolve, fail) => {
        reject = fail;
      }),
  );
  const { runtime } = await setup();
  try {
    await runtime.refresh();
    const pending = runtime.createModelFetch('cloud-model', 'agent')(
      'https://cloud.example/v1/messages',
      { method: 'POST', body: JSON.stringify({ model: 'cloud-model' }) },
    );
    let settled = false;
    const failure = pending.catch((error: unknown) => {
      settled = true;
      return error;
    });
    await jest.advanceTimersByTimeAsync(59_999);
    expect(settled).toBe(false);
    expect(mockInference.mock.lastCall![1].signal.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    expect(await failure).toMatchObject({
      name: 'TimeoutError',
      code: 'cloud_response_headers_timeout',
      retryable: true,
      timeoutMs: 60_000,
    });
    expect(mockInference.mock.lastCall![1].signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
    reject(new Error('Late transport rejection'));
    await jest.advanceTimersByTimeAsync(0);
  } finally {
    await runtime._doStop();
  }
});

test.each(['before send', 'while waiting'])(
  'honors caller cancellation %s without waiting for the header deadline',
  async (when) => {
    mockInference.mockImplementation(() => new Promise<Response>(() => {}));
    const { runtime } = await setup();
    try {
      await runtime.refresh();
      const controller = new AbortController();
      const reason = new Error('Caller cancelled');
      if (when === 'before send') controller.abort(reason);
      const pending = runtime.createModelFetch('cloud-model', 'agent')(
        'https://cloud.example/v1/messages',
        {
          method: 'POST',
          body: JSON.stringify({ model: 'cloud-model' }),
          signal: controller.signal,
        },
      );
      const failure = expect(pending).rejects.toBe(reason);
      await jest.advanceTimersByTimeAsync(0);
      if (when === 'while waiting') {
        expect(mockInference).toHaveBeenCalledTimes(1);
        controller.abort(reason);
      } else expect(mockInference).not.toHaveBeenCalled();
      await failure;
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      await runtime._doStop();
    }
  },
);

test('clears the header deadline after a transport failure', async () => {
  const failure = new Error('Connection failed');
  mockInference.mockRejectedValue(failure);
  const { runtime } = await setup();
  try {
    await runtime.refresh();
    await expect(
      runtime.createModelFetch('cloud-model', 'agent')('https://cloud.example/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ model: 'cloud-model' }),
      }),
    ).rejects.toBe(failure);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    await runtime._doStop();
  }
});

test('does not apply the header deadline to a long reasoning or streaming response', async () => {
  const upstream = inferenceResponse();
  mockInference.mockResolvedValue(upstream.response);
  const { runtime } = await setup();
  try {
    await runtime.refresh();
    const response = await runtime.createModelFetch('cloud-model', 'agent')(
      'https://cloud.example/v1/messages',
      { method: 'POST', body: JSON.stringify({ model: 'cloud-model', stream: true }) },
    );
    expect(jest.getTimerCount()).toBe(0);
    const reader = response.body!.getReader();
    for (const chunk of ['reasoning', 'answer']) {
      await jest.advanceTimersByTimeAsync(120_000);
      expect(mockInference.mock.lastCall![1].signal.aborted).toBe(false);
      upstream.push(chunk);
      expect(new TextDecoder().decode((await reader.read()).value)).toBe(chunk);
    }
    upstream.close();
    expect((await reader.read()).done).toBe(true);
    reader.releaseLock();
  } finally {
    await runtime._doStop();
  }
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
  'sends device-signed member requests for %s at %s%s with %s use',
  async (endpoint, path, query, use) => {
    mockHeaders.mockImplementation(async (_method, _path, _body, key) => ({
      authorization: 'Bearer product-session',
      'Cherry-Signature': 'device-signature',
      'Idempotency-Key': key,
    }));
    mockGet.mockImplementation(async (account: string, resource: string) => {
      if (resource !== '/v1/models?limit=1000&catalog=full') return reply(account, resource);
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
        expect(mockClientSignatureHeaders).not.toHaveBeenCalled();
        expect(init.headers.get('X-Signature')).toBeNull();
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
    resource === '/v1/models?limit=1000&catalog=full'
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
  const guest = {
    ...cloudSnapshot().models[0],
    is_free: true,
    requires_plan: false,
    requires_login: false,
    standalone: true,
  };
  mockClientSignatureHeaders.mockResolvedValue({ 'X-Signature': 'signed' });
  mockPublicRequest.mockResolvedValue({ data: { data: [guest] } });
  const { runtime } = await setup(null);
  try {
    await runtime.refresh();
    mockClientSignatureHeaders.mockRejectedValue(new Error('Native signing failed'));
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
    expect(mockGet).toHaveBeenCalledTimes(result === 'failed' ? 2 : 3);
    expect(runtime.getState()).toMatchObject({
      phase: result === 'failed' ? 'error' : 'ready',
      isRefreshing: false,
    });
    changeAppState('inactive');
    changeAppState('active');
    changeAppState('background');
    changeAppState('active');
    await jest.advanceTimersByTimeAsync(120_000);
    expect(mockGet).toHaveBeenCalledTimes(result === 'failed' ? 2 : 3);
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
  mockHeaders.mockReturnValueOnce(
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
      if (path === '/v1/models?limit=1000&catalog=full') throw new Error('Catalog unavailable');
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
    path === '/v1/models?limit=1000&catalog=full' ? pendingModels : reply(id, path),
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
  mockClientSignatureHeaders.mockResolvedValue({ 'X-Signature': 'guest-signature' });
  mockPublicRequest.mockResolvedValue({ data: { data: [] } });
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
  ).rejects.toMatchObject({ code: 'cloud_subscription_required' });

  status = 'active';
  await runtime.refresh();
  expect(mockProject.mock.lastCall?.[2]).toEqual(cloudSnapshot().models);

  status = 'inactive';
  await runtime.refresh();
  expect(mockProject.mock.lastCall?.[2]).toEqual([]);
  await runtime._doStop();
});

test.each([
  { body: null, retryAfter: undefined, cooldownMs: 30_000 },
  { body: 'not JSON', retryAfter: 'invalid', cooldownMs: 30_000 },
  {
    body: JSON.stringify({ error: { code: 'UNKNOWN_CODE' } }),
    retryAfter: '60',
    cooldownMs: 60_000,
  },
  {
    body: JSON.stringify({ error: { code: 'RATE_LIMITED' } }),
    retryAfter: 'Thu, 01 Jan 2026 00:01:00 GMT',
    cooldownMs: 60_000,
  },
])(
  'terminalizes signed-in 429 and honors its cooldown: $retryAfter',
  async ({ body, retryAfter, cooldownMs }) => {
    jest.setSystemTime(Date.parse('2026-01-01T00:00:00Z'));
    mockInference
      .mockResolvedValueOnce(
        new Response(body, {
          status: 429,
          headers: retryAfter === undefined ? {} : { 'retry-after': retryAfter },
        }),
      )
      .mockResolvedValue(new Response(null, { status: 200 }));
    const { runtime } = await setup();
    try {
      await runtime.refresh();
      const send = () =>
        runtime.createModelFetch('cloud-model', 'agent')('https://cloud.example/v1/messages', {
          method: 'POST',
          body: JSON.stringify({ model: 'cloud-model' }),
        });
      await expect(send()).rejects.toMatchObject({
        statusCode: 429,
        code: 'RATE_LIMITED',
        retryable: false,
      });
      await jest.advanceTimersByTimeAsync(cooldownMs - 1);
      await expect(send()).rejects.toMatchObject({ statusCode: 429, retryable: false });
      expect(mockInference).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      await expect(send()).resolves.toMatchObject({ status: 200 });
      expect(mockInference).toHaveBeenCalledTimes(2);
      expect(runtime.getState().phase).toBe('ready');
      expect(runtime.getState().accountIssue).toBeUndefined();
    } finally {
      await runtime._doStop();
    }
  },
);

test.each([401, 500, 503])(
  'preserves an uncoded signed-in HTTP %s response for Pi',
  async (status) => {
    const response = new Response(null, { status });
    mockInference.mockResolvedValue(response);
    const { runtime } = await setup();
    try {
      await runtime.refresh();
      await expect(
        runtime.createModelFetch('cloud-model', 'agent')('https://cloud.example/v1/messages', {
          method: 'POST',
          body: JSON.stringify({ model: 'cloud-model' }),
        }),
      ).resolves.toBe(response);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      await runtime._doStop();
    }
  },
);

test('surfaces the server quota refusal even when the local snapshot already shows zero quota', async () => {
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
  ).rejects.toMatchObject({ statusCode: 429, code: 'RATE_LIMITED', retryable: false });
  expect(runtime.getState().phase).toBe('ready');
  await runtime._doStop();
});

test('retains allowlisted upstream details on 429 while honoring cooldown and omitting private text', async () => {
  jest.setSystemTime(Date.parse('2026-01-01T00:00:00Z'));
  mockInference
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 'insufficient_quota',
            type: 'rate_limit_error',
            message: 'private customer quota text',
          },
        }),
        { status: 429, headers: { 'retry-after': '60' } },
      ),
    )
    .mockResolvedValue(new Response(null, { status: 200 }));
  const { runtime } = await setup();
  try {
    await runtime.refresh();
    const send = () =>
      runtime.createModelFetch('cloud-model', 'agent')('https://cloud.example/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ model: 'cloud-model' }),
      });
    const rejected = await send().catch((error: unknown) => error);
    expect(rejected).toMatchObject({
      statusCode: 429,
      code: 'RATE_LIMITED',
      retryable: false,
      body: JSON.stringify({ error: { code: 'insufficient_quota', type: 'rate_limit_error' } }),
    });
    expect(JSON.stringify(rejected)).not.toContain('private');
    await jest.advanceTimersByTimeAsync(59_999);
    await expect(send()).rejects.toMatchObject({ statusCode: 429, retryable: false });
    expect(mockInference).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    await expect(send()).resolves.toMatchObject({ status: 200 });
    expect(mockInference).toHaveBeenCalledTimes(2);
  } finally {
    await runtime._doStop();
  }
});

test('uses the AMD catalog activation flag instead of a paid entitlement and preserves the key on replay', async () => {
  const model: CloudModel = {
    ...cloudSnapshot().models[0],
    activation_endpoint: '/api/v1/amd/desktop/entry',
    id: 'amd/free-model',
    provider: 'amd',
    requires_plan: false,
    is_free: true,
    endpoint_type: 'openai-chat-completions',
  };
  let activationRequired = true;
  mockGet.mockImplementation(async (account: string, path: string) => {
    if (path === '/v1/models?limit=1000&catalog=full')
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
    await expect(request()).rejects.toMatchObject({ code: 'cloud_activation_required' });
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
  let endpoint: string | null = '/api/v1/amd/mobile/activation';
  const modelId = 'amd/catalog-id';
  mockGet.mockImplementation(async (account: string, path: string) => {
    if (path === '/v1/models?limit=1000&catalog=full')
      return {
        data: [
          {
            ...cloudSnapshot(account).models[0],
            id: modelId,
            endpoint_type: 'openai-chat-completions',
            provider: 'amd',
            requires_plan: false,
            is_free: true,
            activation_required: !status.activated,
            activation_endpoint: endpoint,
          },
        ],
      };
    return path === '/api/v1/amd/desktop/status' ? status : reply(account, path);
  });
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
    await expect(runtime.createActivationEntry(modelId)).resolves.toBe(entry);
    expect(mockPostEmpty).toHaveBeenCalledWith('account-a', endpoint, service.apiOrigin);
    status = { ...status, status: 'registered', action: 'none', activated: true };
    await runtime.refreshAmd();
    await expect(runtime.createActivationEntry(modelId)).resolves.toBe(entry);
    for (endpoint of [
      'https://another.example/entry',
      '//another.example/entry',
      '/entry?ticket=invalid',
      null,
    ]) {
      await runtime.refresh();
      await expect(runtime.createActivationEntry(modelId)).rejects.toMatchObject({
        code: 'cloud_unavailable',
      });
    }
    expect(mockPostEmpty).toHaveBeenCalledTimes(2);
    change(null);
    expect(runtime.getState().amd).toBeUndefined();
    await expect(runtime.createActivationEntry(modelId)).rejects.toMatchObject({
      code: 'cloud_unavailable',
    });
  } finally {
    await runtime._doStop();
  }
});

test('refreshes AMD status and models on return even while pre-activation reads are pending', async () => {
  const model: CloudModel = {
    ...cloudSnapshot().models[0],
    activation_endpoint: '/api/v1/amd/desktop/entry',
    id: 'amd/free-model',
    provider: 'amd',
    requires_plan: false,
    is_free: true,
    endpoint_type: 'openai-chat-completions',
  };
  let activated = false;
  let delayOldReads = false;
  let releaseOldReads!: () => void;
  const oldReads = new Promise<void>((resolve) => {
    releaseOldReads = resolve;
  });
  mockGet.mockImplementation(async (account: string, path: string) => {
    if (path !== '/v1/models?limit=1000&catalog=full' && path !== '/api/v1/amd/desktop/status')
      return reply(account, path);
    const wasActivated = activated;
    if (delayOldReads && !wasActivated) await oldReads;
    return path === '/v1/models?limit=1000&catalog=full'
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

test('guest discovery and inference sign the exact request without sending account or device credentials', async () => {
  const open = {
    ...cloudSnapshot().models[0],
    id: 'public',
    requires_login: false,
    requires_plan: false,
    standalone: true,
    is_free: true,
  };
  const locked = { ...open, id: 'member', requires_login: true };
  const paid = { ...cloudSnapshot().models[0], id: 'paid' };
  const headers = { 'X-Client-ID': 'cherry-studio', 'X-Timestamp': '123', 'X-Signature': 'signed' };
  mockClientSignatureHeaders.mockResolvedValue(headers);
  mockPublicRequest.mockResolvedValue({ data: { data: [open, locked, paid] } });
  const { runtime, change } = await setup(null);
  try {
    await runtime.refresh();
    expect(mockClientSignatureHeaders).toHaveBeenCalledWith(
      'GET',
      '/v1/models?limit=1000&catalog=full',
      '',
    );
    expect(mockPublicRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/v1/models?limit=1000&catalog=full',
        headers,
        credentials: 'omit',
        redirect: 'error',
      }),
    );
    expect(runtime.getState().models.map((m) => m.id)).toEqual(['public', 'member', 'paid']);
    expect(mockProject.mock.lastCall?.[2].map((m) => m.id)).toEqual(['public']);
    const body = JSON.stringify({ model: 'public', stream: true });
    const url = service.apiOrigin + '/v1/messages';
    const init = {
      method: 'POST',
      body,
      headers: { authorization: 'Bearer sdk', 'Cherry-Device-ID': 'stale', Cookie: 'stale' },
    };
    const send = runtime.createModelFetch('public', 'agent');
    mockInference.mockResolvedValue(new Response(null, { status: 200 }));
    for (const model of [locked, paid]) {
      await expect(runtime.createModelFetch(model.id, 'agent')(url, init)).rejects.toMatchObject({
        reason: 'signed_out',
      });
    }
    expect(mockInference).not.toHaveBeenCalled();
    await expect(send(url, init)).resolves.toMatchObject({ status: 200 });
    expect(mockClientSignatureHeaders).toHaveBeenCalledWith('POST', '/v1/messages', body);
    const sent = mockInference.mock.lastCall![1];
    expect(sent.body).toBe(body);
    expect(sent.headers.get('X-Signature')).toBe('signed');
    for (const key of ['Authorization', 'Cherry-Device-ID', 'Cherry-Signature', 'Cookie'])
      expect(sent.headers.get(key)).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockHeaders).not.toHaveBeenCalled();
    change({ key: 'a', profileId: 'account-a', ...service });
    await expect(send(url, init)).rejects.toBeDefined();
    await runtime.refresh();
    expect(mockGet).toHaveBeenCalledWith(
      'account-a',
      '/v1/models?limit=1000&catalog=full',
      service.apiOrigin,
    );
  } finally {
    await runtime._doStop();
  }
});

test('a missing guest HMAC stops the catalog request', async () => {
  const { runtime } = await setup(null);
  await expect(runtime.refresh()).rejects.toBeDefined();
  expect(mockPublicRequest).not.toHaveBeenCalled();
  expect(runtime.getState().guestCatalog).toBe('error');
  await runtime._doStop();
});

test.each([
  { retryAfter: '60', cooldownMs: 60_000 },
  { retryAfter: undefined, cooldownMs: 30_000 },
  { retryAfter: 'invalid', cooldownMs: 30_000 },
])(
  'guest inference honors the gateway IP cooldown across model IDs: $retryAfter',
  async ({ retryAfter, cooldownMs }) => {
    const model = {
      ...cloudSnapshot().models[0],
      requires_login: false,
      requires_plan: false,
      standalone: true,
      is_free: true,
    };
    mockClientSignatureHeaders.mockResolvedValue({ 'X-Signature': 'signed' });
    mockPublicRequest.mockResolvedValue({ data: { data: [model, { ...model, id: 'another' }] } });
    const { runtime } = await setup(null);
    try {
      await runtime.refresh();
      const send = (id: string) =>
        runtime.createModelFetch(id, 'agent')(service.apiOrigin + '/v1/messages', {
          method: 'POST',
          body: JSON.stringify({ model: id }),
        });
      mockInference.mockResolvedValueOnce(
        new Response(null, {
          status: 429,
          headers: retryAfter === undefined ? {} : { 'retry-after': retryAfter },
        }),
      );
      await expect(send(model.id)).rejects.toMatchObject({ statusCode: 429 });
      await expect(send('another')).rejects.toMatchObject({ statusCode: 429 });
      expect(mockInference).toHaveBeenCalledTimes(1);
      const catalogCalls = mockPublicRequest.mock.calls.length;
      const projectCalls = mockProject.mock.calls.length;
      await expect(runtime.refresh()).rejects.toMatchObject({ statusCode: 429 });
      expect(mockPublicRequest).toHaveBeenCalledTimes(catalogCalls);
      expect(mockProject).toHaveBeenCalledTimes(projectCalls);
      expect(runtime.getState()).toMatchObject({
        guestCatalog: 'ready',
        isRefreshing: false,
        models: [model, { ...model, id: 'another' }],
      });
      mockInference.mockResolvedValue(new Response(null, { status: 200 }));
      await jest.advanceTimersByTimeAsync(cooldownMs - 1);
      await expect(send('another')).rejects.toMatchObject({ statusCode: 429 });
      expect(mockInference).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      await expect(send('another')).resolves.toMatchObject({ status: 200 });
      expect(mockInference).toHaveBeenCalledTimes(2);
    } finally {
      await runtime._doStop();
    }
  },
);

test('a recognized plan refusal refreshes account entitlements, without signing out', async () => {
  const { runtime } = await setup();
  try {
    await runtime.refresh();
    mockGet.mockClear();
    mockInference.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'ENTITLEMENT_INACTIVE' } }), { status: 403 }),
    );
    await expect(
      runtime.createModelFetch('cloud-model', 'agent')('https://cloud.example/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ model: 'cloud-model' }),
      }),
    ).rejects.toMatchObject({ code: 'ENTITLEMENT_INACTIVE' });
    await jest.advanceTimersByTimeAsync(0);
    expect(mockGet).toHaveBeenCalledWith('account-a', '/api/v1/account', service.apiOrigin);
    expect(runtime.getState().accountIssue).toBeUndefined();
  } finally {
    await runtime._doStop();
  }
});

test('a subscriber can use a covered model when catalog metadata is incomplete', async () => {
  const model = {
    id: 'cloud-model',
    available_features: ['agent'],
  };
  mockGet.mockImplementation(async (account: string, path: string) =>
    path === '/v1/models?limit=1000&catalog=full'
      ? { data: [{ display_name: 'No model ID' }, model] }
      : reply(account, path),
  );
  mockInference.mockResolvedValue(new Response(null, { status: 200 }));
  const { runtime } = await setup();
  try {
    await runtime.refresh();
    expect(runtime.getState()).toMatchObject({
      phase: 'ready',
      models: [{ id: model.id, display_name: model.id, capabilities: [], requires_plan: true }],
    });
    await expect(
      runtime.createModelFetch(model.id, 'agent')('https://cloud.example/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ model: model.id }),
      }),
    ).resolves.toMatchObject({ status: 200 });
  } finally {
    await runtime._doStop();
  }
});

test('an account without a plan can see a published plan model but cannot use it', async () => {
  mockGet.mockImplementation(async (account: string, path: string) => {
    if (path === '/api/v1/account')
      return { ...cloudSnapshot(account).account, entitlements: [], quota_pools: [] };
    return reply(account, path);
  });
  const { runtime } = await setup();
  try {
    await runtime.refresh();
    expect(runtime.getState()).toMatchObject({
      phase: 'ready',
      account: { entitlements: [] },
      models: cloudSnapshot().models,
    });
    expect(mockProject.mock.lastCall?.[2]).toEqual([]);
    await expect(
      runtime.createModelFetch('cloud-model', 'agent')('https://cloud.example/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ model: 'cloud-model' }),
      }),
    ).rejects.toMatchObject({ code: 'cloud_subscription_required' });
  } finally {
    await runtime._doStop();
  }
});
