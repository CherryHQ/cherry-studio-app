import type { ApiKeyEntry } from '@cherrystudio/universal/data/types/provider';
import { AES, CBC, Hex, Pkcs7, Utf8 } from 'crypto-es';

import { OAuthRuntimeService } from '../../runtime/OAuthRuntimeService';
import { createOAuthProviderDefinitions } from '../../runtime/providerDefinitions';
import type { OAuthTokenStore, OAuthTokenStoreData } from '../../runtime/types';
import { createOAuthFlowRegistry } from '../createOAuthFlowRegistry';
import { OAuthApiKeyStore } from '../OAuthApiKeyStore';
import { ProviderOAuthService } from '../ProviderOAuthService';

const services: { oauth: ProviderOAuthService; runtime: OAuthRuntimeService }[] = [];

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: jest.fn(async () => 'Y2hhbGxlbmdl'),
  randomUUID: jest
    .fn()
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
    .mockReturnValue('00000000-0000-4000-8000-000000000003'),
}));

jest.mock('../../runtime/PkceOAuthClient', () => {
  const actual = jest.requireActual('../../runtime/PkceOAuthClient');
  return {
    ...actual,
    PkceOAuthClient: jest.fn().mockImplementation(() => ({
      exchangeCode: jest.fn(async () => ({ access_token: 'session-token' })),
      refresh: jest.fn(),
    })),
  };
});

function createTokenStore() {
  const values = new Map<string, OAuthTokenStoreData>();
  const store: OAuthTokenStore = {
    clear: jest.fn(async (providerId) => {
      values.delete(providerId);
    }),
    get: jest.fn(async (providerId) => values.get(providerId) ?? null),
    set: jest.fn(async (providerId, data) => {
      values.set(providerId, data);
    }),
  };
  return { store, values };
}

function createSubject(
  options: {
    fetch?: jest.Mock;
    keys?: Record<string, ApiKeyEntry[]>;
    secrets?: { aihubmix?: string; ppio?: string };
  } = {},
) {
  const keys = new Map(Object.entries(options.keys ?? {}));
  const tokenStore = createTokenStore();
  const providers = {
    listApiKeys: jest.fn(async (providerId: string) => ({ keys: keys.get(providerId) ?? [] })),
    replaceApiKeys: jest.fn(async (providerId: string, next: ApiKeyEntry[]) => {
      keys.set(providerId, next);
    }),
    update: jest.fn(async () => undefined),
  };
  const fetch = options.fetch ?? jest.fn();
  const apiKeys = new OAuthApiKeyStore(providers);
  const definitions = createOAuthProviderDefinitions(fetch);
  const runtime = new OAuthRuntimeService({
    apiKeys,
    definitions,
    fetch,
    providers,
    tokenStore: tokenStore.store,
  });
  const registry = createOAuthFlowRegistry({
    apiKeys,
    definitions,
    fetch,
    providers,
    runtime,
    secrets: options.secrets,
    tokenStore: tokenStore.store,
  });
  const oauth = new ProviderOAuthService(registry.registry);
  services.push({ oauth, runtime });
  return { copilot: registry.copilot, keys, providers, service: oauth, tokenStore };
}

function deviceCodeResponse(input: { expiresIn?: number; interval?: number } = {}) {
  return new Response(
    JSON.stringify({
      device_code: 'device-code',
      expires_in: input.expiresIn ?? 900,
      interval: input.interval ?? 1,
      user_code: 'ABCD-EFGH',
      verification_uri: 'https://github.com/login/device',
    }),
    { status: 200 },
  );
}

function encryptAiHubMixPayload(secret: string, apiKey: string) {
  const iv = '1234567890abcdef1234567890abcdef';
  const encryptedData = AES.encrypt(
    JSON.stringify({ api_keys: [{ value: apiKey }] }),
    Utf8.parse(secret),
    { iv: Hex.parse(iv), mode: CBC, padding: Pkcs7 },
  ).ciphertext!.toString(Hex);

  return JSON.stringify({
    payload: { data: { encryptedData, iv }, key: 'cherry_studio_oauth_callback' },
  });
}

describe('Provider OAuth adapters', () => {
  afterEach(() => {
    for (const service of services.splice(0)) {
      service.oauth.dispose();
      service.runtime.dispose();
    }
    jest.useRealTimers();
  });

  it('owns CherryIN PKCE state and rejects a callback with a different state', async () => {
    const subject = createSubject();
    const flow = await subject.service.startAuthorization({
      providerId: 'cherryin',
      redirectUri: 'cherrystudio://oauth/callback',
    });
    expect(flow.type).toBe('pkce-session');
    expect('authorizationUrl' in flow ? flow.authorizationUrl : '').toContain('code_challenge=');

    await expect(
      subject.service.completeAuthorization({
        callbackUrl: 'cherrystudio://oauth/callback?code=code&state=wrong',
        flowId: flow.flowId,
        type: 'pkce-session',
      }),
    ).rejects.toMatchObject({ code: 'InvalidOAuthState' });
    await expect(subject.service.getAuthorization(flow.flowId)).rejects.toMatchObject({
      code: 'OAuthFlowExpired',
    });
  });

  it('ignores unrelated same-origin WebView messages, then stores a validated API key', async () => {
    const manual = { id: 'manual', isEnabled: true, key: 'manual-key', label: 'Primary' };
    const subject = createSubject({ keys: { silicon: [manual] } });
    const flow = await subject.service.startAuthorization({ providerId: 'silicon' });
    expect(flow.type).toBe('webview-api-key');

    await expect(
      subject.service.completeAuthorization({
        data: JSON.stringify({ payload: { unrelated: true } }),
        flowId: flow.flowId,
        sourceUrl: 'https://account.siliconflow.cn/oauth',
        type: 'webview-api-key',
      }),
    ).resolves.toEqual({ status: 'ignored' });

    await expect(
      subject.service.completeAuthorization({
        data: JSON.stringify({ payload: [{ secretKey: 'oauth-key' }] }),
        flowId: flow.flowId,
        sourceUrl: 'https://account.siliconflow.cn/oauth',
        type: 'webview-api-key',
      }),
    ).resolves.toEqual({ status: 'completed' });
    expect(subject.keys.get('silicon')).toEqual([
      manual,
      expect.objectContaining({ isEnabled: true, key: 'oauth-key', label: 'OAuth' }),
    ]);
  });

  it('rejects WebView completion from a non-allowlisted origin', async () => {
    const subject = createSubject();
    const flow = await subject.service.startAuthorization({ providerId: '302ai' });
    expect(flow).toMatchObject({
      allowedOrigins: ['https://dash.302.ai', 'https://302.ai'],
      type: 'webview-api-key',
    });

    await expect(
      subject.service.completeAuthorization({
        data: JSON.stringify({ payload: { data: { apikey: 'stolen' } } }),
        flowId: flow.flowId,
        sourceUrl: 'https://dash.302.ai.attacker.example/callback',
        type: 'webview-api-key',
      }),
    ).rejects.toMatchObject({ code: 'InvalidWebviewOrigin' });
    expect(subject.providers.replaceApiKeys).not.toHaveBeenCalled();
  });

  it('rejects WebView messages larger than 64 KiB', async () => {
    const subject = createSubject();
    const flow = await subject.service.startAuthorization({ providerId: 'silicon' });

    await expect(
      subject.service.completeAuthorization({
        data: 'x'.repeat(64 * 1024 + 1),
        flowId: flow.flowId,
        sourceUrl: 'https://account.siliconflow.cn/oauth',
        type: 'webview-api-key',
      }),
    ).rejects.toMatchObject({ code: 'InvalidWebviewMessage' });
    expect(subject.providers.replaceApiKeys).not.toHaveBeenCalled();
  });

  it('accepts AIOnly credentials from its official invitation origin', async () => {
    const subject = createSubject();
    const flow = await subject.service.startAuthorization({ providerId: 'aionly' });
    expect(flow).toMatchObject({
      allowedOrigins: ['https://maas.aiionly.com', 'https://aiionly.com'],
      type: 'webview-api-key',
    });

    await expect(
      subject.service.completeAuthorization({
        data: JSON.stringify({ payload: [{ secretKey: 'aionly-oauth-key' }] }),
        flowId: flow.flowId,
        sourceUrl: 'https://aiionly.com/invitationLogin',
        type: 'webview-api-key',
      }),
    ).resolves.toEqual({ status: 'completed' });
    expect(subject.keys.get('aionly')).toEqual([
      expect.objectContaining({ key: 'aionly-oauth-key', label: 'OAuth' }),
    ]);
  });

  it.each([
    ['aihubmix', 'missing-aihubmix-secret'],
    ['ppio', 'missing-ppio-secret'],
  ])('fails closed when %s build credentials are absent', async (providerId, issue) => {
    const subject = createSubject({ secrets: {} });
    await expect(subject.service.getStatus(providerId)).resolves.toMatchObject({
      configurationIssue: issue,
      isConfigured: false,
    });
    await expect(subject.service.startAuthorization({ providerId })).rejects.toMatchObject({
      code: issue,
    });
  });

  it('decrypts a valid AiHubMix response and rejects one encrypted with another key', async () => {
    const secret = '12345678901234567890123456789012';
    const subject = createSubject({ secrets: { aihubmix: secret } });
    const validFlow = await subject.service.startAuthorization({ providerId: 'aihubmix' });

    await expect(
      subject.service.completeAuthorization({
        data: encryptAiHubMixPayload(secret, 'aihubmix-oauth-key'),
        flowId: validFlow.flowId,
        sourceUrl: 'https://console.inferera.com/token',
        type: 'webview-api-key',
      }),
    ).resolves.toEqual({ status: 'completed' });
    expect(subject.keys.get('aihubmix')).toEqual([
      expect.objectContaining({ key: 'aihubmix-oauth-key', label: 'OAuth' }),
    ]);

    const invalidFlow = await subject.service.startAuthorization({ providerId: 'aihubmix' });
    await expect(
      subject.service.completeAuthorization({
        data: encryptAiHubMixPayload('abcdefghijklmnopqrstuvwxyz123456', 'wrong-key'),
        flowId: invalidFlow.flowId,
        sourceUrl: 'https://console.inferera.com/token',
        type: 'webview-api-key',
      }),
    ).rejects.toMatchObject({ code: 'InvalidWebviewMessage' });
  });

  it('exchanges a PPIO authorization code and retains manually entered keys', async () => {
    const fetch = jest.fn(
      async () => new Response(JSON.stringify({ access_token: 'ppio-oauth-key' }), { status: 200 }),
    );
    const manual = { id: 'manual', isEnabled: true, key: 'manual-key', label: 'Primary' };
    const subject = createSubject({
      fetch,
      keys: { ppio: [manual] },
      secrets: { ppio: 'build-secret' },
    });
    const flow = await subject.service.startAuthorization({
      providerId: 'ppio',
      redirectUri: 'cherrystudio://oauth/callback',
    });
    const authorizationUrl = new URL(
      'authorizationUrl' in flow ? flow.authorizationUrl : 'https://invalid.example',
    );

    await subject.service.completeAuthorization({
      callbackUrl: `cherrystudio://oauth/callback?code=ppio-code&state=${authorizationUrl.searchParams.get('state')}`,
      flowId: flow.flowId,
      type: 'authorization-code-api-key',
    });

    expect(subject.keys.get('ppio')).toEqual([
      manual,
      expect.objectContaining({ key: 'ppio-oauth-key', label: 'OAuth' }),
    ]);
    const [, init] = (fetch.mock.calls as unknown as [RequestInfo | URL, RequestInit?][])[0];
    expect(String(init?.body)).toContain('client_secret=build-secret');
  });

  it('rejects PPIO callbacks with a mismatched state or redirect path', async () => {
    const subject = createSubject({ secrets: { ppio: 'build-secret' } });

    const wrongStateFlow = await subject.service.startAuthorization({ providerId: 'ppio' });
    await expect(
      subject.service.completeAuthorization({
        callbackUrl: 'cherrystudio://oauth/callback?code=ppio-code&state=wrong',
        flowId: wrongStateFlow.flowId,
        type: 'authorization-code-api-key',
      }),
    ).rejects.toMatchObject({ code: 'InvalidOAuthState' });

    const wrongRedirectFlow = await subject.service.startAuthorization({ providerId: 'ppio' });
    const authorizationUrl = new URL(
      'authorizationUrl' in wrongRedirectFlow
        ? wrongRedirectFlow.authorizationUrl
        : 'https://invalid.example',
    );
    await expect(
      subject.service.completeAuthorization({
        callbackUrl: `cherrystudio://oauth/other?code=ppio-code&state=${authorizationUrl.searchParams.get('state')}`,
        flowId: wrongRedirectFlow.flowId,
        type: 'authorization-code-api-key',
      }),
    ).rejects.toMatchObject({ code: 'InvalidOAuthCallback' });
    expect(subject.providers.replaceApiKeys).not.toHaveBeenCalled();
  });

  it('rejects a PPIO redirect URI with authority credentials or a port', async () => {
    const subject = createSubject({ secrets: { ppio: 'build-secret' } });

    await expect(
      subject.service.startAuthorization({
        providerId: 'ppio',
        redirectUri: 'cherrystudio://oauth:123/callback',
      }),
    ).rejects.toMatchObject({ code: 'InvalidRedirectUri' });
    await expect(
      subject.service.startAuthorization({
        providerId: 'ppio',
        redirectUri: 'cherrystudio://user@oauth/callback',
      }),
    ).rejects.toMatchObject({ code: 'InvalidRedirectUri' });
  });

  it('completes Copilot device authorization and exchanges the GitHub token for serving access', async () => {
    jest.useFakeTimers();
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(deviceCodeResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'github-token' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ login: 'octocat' }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'copilot-serving-token' }), { status: 200 }),
      );
    const subject = createSubject({ fetch });
    const flow = await subject.service.startAuthorization({ providerId: 'copilot' });
    expect(flow).toMatchObject({
      type: 'device-code-session',
      userCode: 'ABCD-EFGH',
      verificationUri: 'https://github.com/login/device',
    });

    const completion = subject.service.completeAuthorization({
      flowId: flow.flowId,
      type: 'device-code-session',
    });
    await jest.advanceTimersByTimeAsync(1000);
    await expect(completion).resolves.toEqual({ status: 'completed' });
    await expect(subject.service.getStatus('copilot')).resolves.toMatchObject({
      accountId: 'octocat',
      isAuthenticated: true,
    });
    await expect(subject.copilot.getServingToken({})).resolves.toBe('copilot-serving-token');
  });

  it('honors Copilot slow_down before polling again', async () => {
    jest.useFakeTimers();
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(deviceCodeResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'slow_down' }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'github-token' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ login: 'octocat' }), { status: 200 }));
    const subject = createSubject({ fetch });
    const flow = await subject.service.startAuthorization({ providerId: 'copilot' });
    const completion = subject.service.completeAuthorization({
      flowId: flow.flowId,
      type: 'device-code-session',
    });

    await jest.advanceTimersByTimeAsync(1_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(5_999);
    expect(fetch).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);

    await expect(completion).resolves.toEqual({ status: 'completed' });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('surfaces Copilot device authorization denial', async () => {
    jest.useFakeTimers();
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(deviceCodeResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 'access_denied',
            error_description: 'The user denied the request',
          }),
          { status: 200 },
        ),
      );
    const subject = createSubject({ fetch });
    const flow = await subject.service.startAuthorization({ providerId: 'copilot' });
    const completion = subject.service.completeAuthorization({
      flowId: flow.flowId,
      type: 'device-code-session',
    });
    const denial = expect(completion).rejects.toMatchObject({
      code: 'CopilotAuthorizationFailed',
    });

    await jest.advanceTimersByTimeAsync(1_000);
    await denial;
    expect(subject.tokenStore.values.has('copilot')).toBe(false);
  });

  it('expires Copilot polling and aborts it on cancellation', async () => {
    jest.useFakeTimers();
    const timeoutFetch = jest
      .fn()
      .mockResolvedValueOnce(deviceCodeResponse({ expiresIn: 2 }))
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ error: 'authorization_pending' }), { status: 200 }),
      );
    const timeoutSubject = createSubject({ fetch: timeoutFetch });
    const timeoutController = new AbortController();
    const timeoutSession = await timeoutSubject.copilot.start(
      { providerId: 'copilot' },
      timeoutController.signal,
    );
    const timeoutCompletion = timeoutSession.complete(
      { type: 'device-code-session' },
      timeoutController.signal,
    );
    const timeout = expect(timeoutCompletion).rejects.toMatchObject({ code: 'OAuthFlowExpired' });

    await jest.advanceTimersByTimeAsync(2_000);
    await timeout;
    expect(timeoutSubject.tokenStore.values.has('copilot')).toBe(false);

    const cancelFetch = jest.fn().mockResolvedValueOnce(deviceCodeResponse({ interval: 5 }));
    const cancelSubject = createSubject({ fetch: cancelFetch });
    const flow = await cancelSubject.service.startAuthorization({ providerId: 'copilot' });
    const completion = cancelSubject.service.completeAuthorization({
      flowId: flow.flowId,
      type: 'device-code-session',
    });
    const cancellation = expect(completion).rejects.toMatchObject({
      cause: expect.objectContaining({ message: 'OAuth authorization cancelled' }),
    });
    await cancelSubject.service.cancelAuthorization(flow.flowId);

    await cancellation;
    expect(cancelFetch).toHaveBeenCalledTimes(1);
    expect(cancelSubject.tokenStore.values.has('copilot')).toBe(false);
  });

  it('reports Codex and Grok login as visibly blocked', async () => {
    const subject = createSubject();
    await expect(subject.service.getStatus('openai-codex')).resolves.toMatchObject({
      flowType: 'blocked',
      isAuthenticated: false,
      isConfigured: false,
    });
    await expect(subject.service.getStatus('grok-cli')).resolves.toMatchObject({
      flowType: 'blocked',
      isAuthenticated: false,
      isConfigured: false,
    });
  });
});
