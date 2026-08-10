import { toOAuthFlowRegistry } from '../OAuthFlowRegistry';
import { ProviderOAuthService } from '../ProviderOAuthService';
import type { OAuthFlowAdapter, OAuthFlowCompletionPayload, OAuthFlowSession } from '../types';

jest.mock('expo-crypto', () => {
  let id = 0;
  return { randomUUID: jest.fn(() => `flow-${++id}`) };
});

const services: ProviderOAuthService[] = [];

function createService(adapters: readonly OAuthFlowAdapter[]): ProviderOAuthService {
  const service = new ProviderOAuthService(toOAuthFlowRegistry(adapters));
  services.push(service);
  return service;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

type MockOAuthFlowAdapter = {
  flowType: OAuthFlowAdapter['flowType'];
  getStatus: jest.MockedFunction<OAuthFlowAdapter['getStatus']>;
  logout: jest.MockedFunction<OAuthFlowAdapter['logout']>;
  providerId: string;
  start: jest.MockedFunction<OAuthFlowAdapter['start']>;
};

function createAdapter(overrides: Partial<MockOAuthFlowAdapter> = {}): MockOAuthFlowAdapter {
  return {
    flowType: 'webview-api-key',
    providerId: 'test-provider',
    getStatus: jest.fn(async () => ({
      accountId: null,
      isAuthenticated: false,
      isConfigured: true,
    })),
    logout: jest.fn(async () => undefined),
    start: jest.fn(
      async (_input, _signal): Promise<OAuthFlowSession> => ({
        presentation: {
          allowedOrigins: ['https://example.com'],
          authorizationUrl: 'https://example.com/oauth',
          type: 'webview-api-key',
        },
        complete: jest.fn(async () => ({ status: 'completed' as const })),
      }),
    ),
    ...overrides,
  };
}

describe('ProviderOAuthService', () => {
  afterEach(() => {
    for (const service of services.splice(0)) service.dispose();
    jest.useRealTimers();
  });

  it('rejects duplicate and unknown provider registrations', async () => {
    const adapter = createAdapter();
    expect(() => toOAuthFlowRegistry([adapter, adapter])).toThrow(
      'Duplicate OAuth adapter for test-provider',
    );

    const service = createService([]);
    await expect(service.getStatus('missing')).rejects.toMatchObject({
      code: 'UnknownOAuthProvider',
    });
  });

  it('returns provider status through the registered adapter', async () => {
    const adapter = createAdapter({
      getStatus: jest.fn(async () => ({
        accountId: 'account',
        isAuthenticated: true,
        isConfigured: true,
      })),
    });
    const service = createService([adapter]);

    await expect(service.getStatus(adapter.providerId)).resolves.toEqual({
      accountId: 'account',
      flowType: 'webview-api-key',
      isAuthenticated: true,
      isConfigured: true,
      providerId: adapter.providerId,
    });
  });

  it('supersedes an existing flow for the same provider', async () => {
    let firstSignal: AbortSignal | undefined;
    const adapter = createAdapter({
      start: jest.fn(async (_input, signal): Promise<OAuthFlowSession> => {
        firstSignal ??= signal;
        return {
          presentation: {
            allowedOrigins: ['https://example.com'],
            authorizationUrl: 'https://example.com/oauth',
            type: 'webview-api-key',
          },
          complete: jest.fn(async () => ({ status: 'completed' as const })),
        };
      }),
    });
    const service = createService([adapter]);
    const first = await service.startAuthorization({ providerId: adapter.providerId });
    const second = await service.startAuthorization({ providerId: adapter.providerId });

    expect(firstSignal?.aborted).toBe(true);
    await expect(service.getAuthorization(first.flowId)).rejects.toMatchObject({
      code: 'OAuthFlowExpired',
    });
    await expect(service.getAuthorization(second.flowId)).resolves.toEqual(second);
  });

  it('rejects a superseded pending start even if its adapter resolves later', async () => {
    const firstStart = deferred<OAuthFlowSession>();
    const session: OAuthFlowSession = {
      presentation: {
        allowedOrigins: ['https://example.com'],
        authorizationUrl: 'https://example.com/oauth',
        type: 'webview-api-key',
      },
      complete: jest.fn(async () => ({ status: 'completed' as const })),
    };
    const adapter = createAdapter({
      start: jest.fn().mockReturnValueOnce(firstStart.promise).mockResolvedValueOnce(session),
    });
    const service = createService([adapter]);

    const first = service.startAuthorization({ providerId: adapter.providerId });
    const second = await service.startAuthorization({ providerId: adapter.providerId });
    firstStart.resolve(session);

    await expect(first).rejects.toThrow('OAuth authorization superseded');
    await expect(service.getAuthorization(second.flowId)).resolves.toEqual(second);
  });

  it('keeps ignored flows active and consumes completed flows', async () => {
    const complete = jest
      .fn<Promise<{ status: 'completed' | 'ignored' }>, [OAuthFlowCompletionPayload, AbortSignal]>()
      .mockResolvedValueOnce({ status: 'ignored' })
      .mockResolvedValueOnce({ status: 'completed' });
    const adapter = createAdapter({
      start: jest.fn(
        async (_input, _signal): Promise<OAuthFlowSession> => ({
          presentation: {
            allowedOrigins: ['https://example.com'],
            authorizationUrl: 'https://example.com/oauth',
            type: 'webview-api-key',
          },
          complete,
        }),
      ),
    });
    const service = createService([adapter]);
    const flow = await service.startAuthorization({ providerId: adapter.providerId });
    const input = {
      data: '{}',
      flowId: flow.flowId,
      sourceUrl: 'https://example.com',
      type: 'webview-api-key' as const,
    };

    await expect(service.completeAuthorization(input)).resolves.toEqual({ status: 'ignored' });
    await expect(service.getAuthorization(flow.flowId)).resolves.toEqual(flow);
    await expect(service.completeAuthorization(input)).resolves.toEqual({ status: 'completed' });
    await expect(service.getAuthorization(flow.flowId)).rejects.toMatchObject({
      code: 'OAuthFlowExpired',
    });
  });

  it('rejects mismatched and concurrent completion without corrupting the flow', async () => {
    const completion = deferred<{ status: 'completed' }>();
    const adapter = createAdapter({
      start: jest.fn(
        async (_input, _signal): Promise<OAuthFlowSession> => ({
          presentation: {
            allowedOrigins: ['https://example.com'],
            authorizationUrl: 'https://example.com/oauth',
            type: 'webview-api-key',
          },
          complete: jest.fn(() => completion.promise),
        }),
      ),
    });
    const service = createService([adapter]);
    const flow = await service.startAuthorization({ providerId: adapter.providerId });

    await expect(
      service.completeAuthorization({
        callbackUrl: 'cherrystudio://oauth/callback',
        flowId: flow.flowId,
        type: 'pkce-session',
      }),
    ).rejects.toMatchObject({ code: 'OAuthFlowTypeMismatch' });

    const first = service.completeAuthorization({
      data: '{}',
      flowId: flow.flowId,
      sourceUrl: 'https://example.com',
      type: 'webview-api-key',
    });
    await expect(
      service.completeAuthorization({
        data: '{}',
        flowId: flow.flowId,
        sourceUrl: 'https://example.com',
        type: 'webview-api-key',
      }),
    ).rejects.toMatchObject({ code: 'OAuthFlowAlreadyCompleting' });

    completion.resolve({ status: 'completed' });
    await expect(first).resolves.toEqual({ status: 'completed' });
  });

  it('expires, logs out, and disposes flows through their public lifecycle', async () => {
    jest.useFakeTimers();
    const signals: AbortSignal[] = [];
    const adapter = createAdapter({
      start: jest.fn(async (_input, signal): Promise<OAuthFlowSession> => {
        signals.push(signal);
        return {
          expiresInMs: 1_000,
          presentation: {
            allowedOrigins: ['https://example.com'],
            authorizationUrl: 'https://example.com/oauth',
            type: 'webview-api-key',
          },
          complete: jest.fn(async () => ({ status: 'completed' as const })),
        };
      }),
    });
    const service = createService([adapter]);
    const expired = await service.startAuthorization({ providerId: adapter.providerId });
    await jest.advanceTimersByTimeAsync(1_000);
    expect(signals[0].aborted).toBe(true);
    await expect(service.getAuthorization(expired.flowId)).rejects.toMatchObject({
      code: 'OAuthFlowExpired',
    });

    await service.startAuthorization({ providerId: adapter.providerId });
    await service.logout(adapter.providerId);
    expect(signals[1].aborted).toBe(true);
    expect(adapter.logout).toHaveBeenCalledTimes(1);

    await service.startAuthorization({ providerId: adapter.providerId });
    service.dispose();
    expect(signals[2].aborted).toBe(true);
  });
});
