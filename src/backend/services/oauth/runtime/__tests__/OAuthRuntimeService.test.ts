import type { ApiKeyEntry, AuthConfig } from '@cherrystudio/universal/data/types/provider';

import { OAuthTransientError } from '@/shared/oauth';

const mockExchangeCode = jest.fn();
const mockRefresh = jest.fn();

jest.mock('expo-crypto', () => {
  let uuid = 0;
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { BASE64: 'base64' },
    digestStringAsync: jest.fn(async () => 'Y2hhbGxlbmdl'),
    randomUUID: jest.fn(() => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`),
  };
});

// Keep OAuthHttpError real — the terminal/retriable grading is an instanceof
// check on it, so a mocked class would silently make every failure retriable.
jest.mock('../PkceOAuthClient', () => ({
  ...jest.requireActual('../PkceOAuthClient'),
  PkceOAuthClient: jest.fn().mockImplementation(() => ({
    exchangeCode: mockExchangeCode,
    refresh: mockRefresh,
  })),
}));

import { OAuthRuntimeService } from '../OAuthRuntimeService';
import { ProviderAuthConfigOAuthTokenStore } from '../OAuthTokenStore';
import { OAuthHttpError } from '../PkceOAuthClient';
import type { OAuthRuntimeProviderDefinition } from '../types';

const mockAfterPersist = jest.fn();
const services: OAuthRuntimeService[] = [];

// codex = OAuth-only (clear disables); cherryin = has a manual API-key fallback
// (clear must NOT disable) and mints API keys after the exchange.
const definitions: Record<string, OAuthRuntimeProviderDefinition> = {
  cherryin: {
    afterPersistTokens: (tokenData, context) => mockAfterPersist(tokenData, context),
    clientId: 'cherryin-client',
    providerId: 'cherryin',
    redirect: { path: 'oauth/callback', scheme: 'cherrystudio' },
    resolveEndpoints: () => ({
      authorizeUrl: 'https://cherryin/auth',
      tokenUrl: 'https://cherryin/token',
    }),
    scopes: 'openid offline_access',
  },
  codex: {
    clearDisablesProvider: true,
    clientId: 'codex-client',
    providerId: 'codex',
    redirect: { path: 'oauth/callback', scheme: 'cherrystudio' },
    resolveEndpoints: () => ({
      authorizeUrl: 'https://codex/auth',
      tokenUrl: 'https://codex/token',
    }),
    scopes: 'openid offline_access',
  },
};

const FUTURE = () => Date.now() + 1_000_000;
const PAST = () => Date.now() - 1_000;

function createSubject() {
  const rows = new Map<
    string,
    { apiKeys: ApiKeyEntry[]; authConfig?: AuthConfig; isEnabled?: boolean }
  >();

  const providers = {
    getAuthConfig: jest.fn(async (providerId: string) => rows.get(providerId)?.authConfig ?? null),
    listApiKeys: jest.fn(async (providerId: string) => ({
      keys: rows.get(providerId)?.apiKeys ?? [],
    })),
    replaceApiKeys: jest.fn(async (providerId: string, apiKeys: ApiKeyEntry[]) => {
      rows.set(providerId, { ...rows.get(providerId), apiKeys });
      return undefined;
    }),
    update: jest.fn(async (providerId: string, patch: Record<string, unknown>) => {
      rows.set(providerId, { apiKeys: [], ...rows.get(providerId), ...patch });
      return undefined;
    }),
  };

  const service = new OAuthRuntimeService({
    definitions,
    providers,
    tokenStore: new ProviderAuthConfigOAuthTokenStore(providers),
  });
  services.push(service);

  const seed = (providerId: string, authConfig: Record<string, unknown>) => {
    rows.set(providerId, {
      apiKeys: rows.get(providerId)?.apiKeys ?? [],
      ...rows.get(providerId),
      authConfig: { clientId: 'x', type: 'oauth', ...authConfig } as AuthConfig,
    });
  };

  return { providers, rows, seed, service };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRefresh.mockReset();
  mockExchangeCode.mockReset();
  mockAfterPersist.mockReset();
});

afterEach(() => {
  for (const service of services.splice(0)) {
    service.dispose();
  }
});

async function completeCherryInAuthorization(service: OAuthRuntimeService): Promise<void> {
  await service.completeAuthorization({
    code: 'code',
    codeVerifier: 'verifier',
    providerId: 'cherryin',
    redirectUri: 'cherrystudio://oauth/callback',
  });
}

describe('OAuthRuntimeService', () => {
  it('returns a still-valid token without refreshing', async () => {
    const { seed, service } = createSubject();
    seed('codex', { accessToken: 'tok', accountId: 'acc', expiresAt: FUTURE() });

    await expect(service.getValidAccessToken('codex')).resolves.toEqual({
      accessToken: 'tok',
      accountId: 'acc',
    });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('refreshes ahead of the expiry buffer rather than waiting for a 401', async () => {
    const { seed, service } = createSubject();
    // Still valid by the clock, but inside the 60s buffer.
    seed('codex', { accessToken: 'tok', expiresAt: Date.now() + 30_000, refreshToken: 'r' });
    mockRefresh.mockResolvedValue({ access_token: 'fresh', expires_in: 3600, refresh_token: 'r2' });

    await expect(service.getValidAccessToken('codex')).resolves.toMatchObject({
      accessToken: 'fresh',
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('throws a transient error and keeps the stored token when a refresh fails transiently', async () => {
    const { rows, seed, service } = createSubject();
    seed('codex', { accessToken: 'old', expiresAt: PAST(), refreshToken: 'r' });
    mockRefresh.mockRejectedValue(new Error('network down'));

    await expect(service.getValidAccessToken('codex')).rejects.toThrow(OAuthTransientError);
    expect(rows.get('codex')?.authConfig).toMatchObject({ refreshToken: 'r', type: 'oauth' });
    expect(rows.get('codex')?.isEnabled).toBeUndefined();
  });

  it('keeps the session when a refresh returns 408 (request timeout)', async () => {
    const { rows, seed, service } = createSubject();
    seed('codex', { accessToken: 'old', expiresAt: PAST(), refreshToken: 'r' });
    mockRefresh.mockRejectedValue(new OAuthHttpError('timeout', 408, ''));

    await expect(service.getValidAccessToken('codex')).rejects.toThrow(OAuthTransientError);
    expect(rows.get('codex')?.authConfig).toMatchObject({ type: 'oauth' });
  });

  it('clears and disables an OAuth-only provider when the refresh token is rejected (4xx)', async () => {
    const { rows, seed, service } = createSubject();
    seed('codex', { accessToken: 'old', expiresAt: PAST(), refreshToken: 'r' });
    mockRefresh.mockRejectedValue(new OAuthHttpError('bad', 400, '{"error":"invalid_grant"}'));

    await expect(service.getValidAccessToken('codex')).resolves.toBeNull();
    expect(rows.get('codex')?.authConfig).toEqual({ type: 'api-key' });
    expect(rows.get('codex')?.isEnabled).toBe(false);
  });

  it('clears but does NOT disable a provider that can hold a manual API key', async () => {
    const { rows, seed, service } = createSubject();
    seed('cherryin', { accessToken: 'old', expiresAt: PAST(), refreshToken: 'r' });
    mockRefresh.mockRejectedValue(new OAuthHttpError('bad', 400, '{}'));

    await expect(service.getValidAccessToken('cherryin')).resolves.toBeNull();
    expect(rows.get('cherryin')?.authConfig).toEqual({ type: 'api-key' });
    expect(rows.get('cherryin')?.isEnabled).toBeUndefined();
  });

  it('does not resurrect the session when a logout races an in-flight refresh', async () => {
    const { rows, seed, service } = createSubject();
    seed('codex', { accessToken: 'old', expiresAt: PAST(), refreshToken: 'r' });
    mockRefresh.mockImplementation(async () => {
      // The user logs out during the token endpoint round-trip.
      await service.logout('codex');
      return { access_token: 'resurrected', expires_in: 3600, refresh_token: 'r2' };
    });

    await expect(service.getValidAccessToken('codex')).resolves.toBeNull();
    expect(rows.get('codex')?.authConfig).toEqual({ type: 'api-key' });
  });

  it('does not clobber a re-login that races an in-flight refresh, and fails the stale request closed', async () => {
    const { rows, seed, service } = createSubject();
    seed('codex', { accessToken: 'old', expiresAt: PAST(), refreshToken: 'r' });
    mockRefresh.mockImplementation(async () => {
      // logout + a fresh sign-in during the token endpoint round-trip.
      seed('codex', { accessToken: 'new-login', expiresAt: FUTURE(), refreshToken: 'r-new' });
      return { access_token: 'stale', expires_in: 3600, refresh_token: 'r2' };
    });

    // The stale refresh must hand out neither its own token nor the new
    // session's — fail closed so the caller retries cleanly.
    await expect(service.getValidAccessToken('codex')).resolves.toBeNull();
    expect(rows.get('codex')?.authConfig).toMatchObject({
      accessToken: 'new-login',
      refreshToken: 'r-new',
    });
  });

  it('does not reuse a superseded session refresh for a re-logged-in session', async () => {
    const { rows, seed, service } = createSubject();
    seed('codex', { accessToken: 'old', expiresAt: PAST(), refreshToken: 'r-old' });

    let resolveOld: (value: unknown) => void = () => undefined;
    const oldRefresh = new Promise((resolve) => {
      resolveOld = resolve;
    });

    mockRefresh.mockImplementation(async (token: string) => {
      if (token === 'r-old') {
        await oldRefresh;
        throw new OAuthHttpError('bad', 400, '{"error":"invalid_grant"}');
      }
      return { access_token: 'fresh-new', expires_in: 3600, refresh_token: 'r-new2' };
    });

    // Kick off the old-session refresh (hangs on the network).
    const oldCall = service.getValidAccessToken('codex');
    // A re-login installs a new session, then forces its own refresh.
    seed('codex', { accessToken: 'new-login', expiresAt: PAST(), refreshToken: 'r-new' });
    const newToken = await service.getValidAccessToken('codex', { forceRefresh: true });

    expect(newToken).toEqual({ accessToken: 'fresh-new', accountId: null });

    // Letting the old refresh finish terminally must not clear the new session.
    resolveOld(undefined);
    await oldCall;
    expect(rows.get('codex')?.authConfig).toMatchObject({
      accessToken: 'fresh-new',
      type: 'oauth',
    });
  });

  it('does not clear a re-login when the old refresh fails terminally', async () => {
    const { rows, seed, service } = createSubject();
    seed('codex', { accessToken: 'old', expiresAt: PAST(), refreshToken: 'r' });
    mockRefresh.mockImplementation(async () => {
      seed('codex', { accessToken: 'new-login', expiresAt: FUTURE(), refreshToken: 'r-new' });
      throw new OAuthHttpError('bad', 400, '{"error":"invalid_grant"}');
    });

    await expect(service.getValidAccessToken('codex')).resolves.toBeNull();
    expect(rows.get('codex')?.authConfig).toMatchObject({
      accessToken: 'new-login',
      refreshToken: 'r-new',
      type: 'oauth',
    });
    expect(rows.get('codex')?.isEnabled).not.toBe(false);
  });

  it('deduplicates concurrent refreshes', async () => {
    const { seed, service } = createSubject();
    seed('codex', { accessToken: 'old', expiresAt: PAST(), refreshToken: 'r' });
    mockRefresh.mockResolvedValue({ access_token: 'new', expires_in: 3600, refresh_token: 'r2' });

    const [a, b] = await Promise.all([
      service.getValidAccessToken('codex'),
      service.getValidAccessToken('codex'),
    ]);

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(a?.accessToken).toBe('new');
    expect(b?.accessToken).toBe('new');
  });

  it('keeps the stored refresh token when the provider omits it on refresh', async () => {
    const { rows, seed, service } = createSubject();
    seed('codex', { accessToken: 'old', expiresAt: PAST(), refreshToken: 'r' });
    mockRefresh.mockResolvedValue({ access_token: 'new', expires_in: 3600 });

    await expect(service.getValidAccessToken('codex')).resolves.toMatchObject({
      accessToken: 'new',
    });
    expect(rows.get('codex')?.authConfig).toMatchObject({ refreshToken: 'r' });
  });

  describe('authenticatedFetch', () => {
    it('retries once on 401 with a refreshed token', async () => {
      const { seed, service } = createSubject();
      seed('codex', { accessToken: 'tok', expiresAt: FUTURE(), refreshToken: 'r' });
      mockRefresh.mockResolvedValue({
        access_token: 'tok2',
        expires_in: 3600,
        refresh_token: 'r2',
      });

      const doFetch = jest
        .fn()
        .mockResolvedValueOnce({ body: { cancel: jest.fn() }, status: 401 } as unknown as Response)
        .mockResolvedValueOnce({ status: 200 } as Response);
      const tokensSeen: string[] = [];

      const response = await service.authenticatedFetch(
        'codex',
        (credentials) => {
          tokensSeen.push(credentials.accessToken);
          return { init: {}, input: 'http://example/api' };
        },
        doFetch,
      );

      expect(response.status).toBe(200);
      expect(doFetch).toHaveBeenCalledTimes(2);
      expect(tokensSeen).toEqual(['tok', 'tok2']);
    });

    it('throws the supplied hint when not signed in', async () => {
      const { service } = createSubject();

      await expect(
        service.authenticatedFetch('codex', () => ({ init: {}, input: 'x' }), jest.fn(), {
          notSignedInMessage: 'please sign in',
        }),
      ).rejects.toThrow('please sign in');
    });

    it('surfaces a transient refresh failure instead of the not-signed-in hint', async () => {
      const { seed, service } = createSubject();
      seed('codex', { accessToken: 'old', expiresAt: PAST(), refreshToken: 'r' });
      mockRefresh.mockRejectedValue(new Error('network down'));
      const doFetch = jest.fn();

      await expect(
        service.authenticatedFetch('codex', () => ({ init: {}, input: 'x' }), doFetch, {
          notSignedInMessage: 'please sign in',
        }),
      ).rejects.toThrow(OAuthTransientError);
      expect(doFetch).not.toHaveBeenCalled();
    });

    it('drains the 401 body when the forced refresh fails transiently', async () => {
      const { seed, service } = createSubject();
      seed('codex', { accessToken: 'tok', expiresAt: FUTURE(), refreshToken: 'r' });
      mockRefresh.mockRejectedValue(new Error('network down'));

      const cancel = jest.fn();
      const doFetch = jest.fn().mockResolvedValue({ body: { cancel }, status: 401 });

      await expect(
        service.authenticatedFetch('codex', () => ({ init: {}, input: 'x' }), doFetch),
      ).rejects.toThrow(OAuthTransientError);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(doFetch).toHaveBeenCalledTimes(1);
    });

    it('reports a persistent 401 to onUnauthorized and returns it', async () => {
      const { seed, service } = createSubject();
      seed('cherryin', { accessToken: 'tok', expiresAt: FUTURE(), refreshToken: 'r' });
      mockRefresh.mockResolvedValue({
        access_token: 'tok2',
        expires_in: 3600,
        refresh_token: 'r2',
      });

      const doFetch = jest
        .fn()
        .mockResolvedValueOnce({ body: { cancel: jest.fn() }, status: 401 } as unknown as Response)
        .mockResolvedValueOnce({ status: 401 } as Response);
      const onUnauthorized = jest.fn();

      const response = await service.authenticatedFetch(
        'cherryin',
        () => ({ init: {}, input: 'http://example/api' }),
        doFetch,
        { context: { apiHost: 'https://open.cherryin.ai' }, onUnauthorized },
      );

      expect(response.status).toBe(401);
      expect(doFetch).toHaveBeenCalledTimes(2);
      expect(mockRefresh).toHaveBeenCalledTimes(1);
      expect(onUnauthorized).toHaveBeenCalledTimes(1);
    });
  });

  describe('completeAuthorization', () => {
    it('persists tokens, stores minted API keys, and enables the provider', async () => {
      const { rows, service } = createSubject();
      mockExchangeCode.mockResolvedValue({
        access_token: 'tok',
        expires_in: 3600,
        refresh_token: 'r',
      });
      mockAfterPersist.mockResolvedValue({ apiKeys: 'key-a,key-b' });

      await completeCherryInAuthorization(service);

      expect(rows.get('cherryin')?.authConfig).toMatchObject({
        accessToken: 'tok',
        refreshToken: 'r',
        type: 'oauth',
      });
      expect(rows.get('cherryin')?.apiKeys.map((entry) => entry.key)).toEqual(['key-a', 'key-b']);
      expect(rows.get('cherryin')?.isEnabled).toBe(true);
    });

    it('keeps the persisted token when the post-persist side effect fails', async () => {
      const { rows, service } = createSubject();
      mockExchangeCode.mockResolvedValue({ access_token: 'tok', refresh_token: 'r' });
      mockAfterPersist.mockRejectedValue(new Error('key fetch failed'));

      await expect(completeCherryInAuthorization(service)).rejects.toMatchObject({
        cause: expect.objectContaining({ message: 'key fetch failed' }),
        name: 'OAuthServiceError',
      });

      // The authorization code is spent — the valid token must survive.
      expect(rows.get('cherryin')?.authConfig).toMatchObject({ accessToken: 'tok' });
    });

    it('preserves manually entered API keys alongside minted ones', async () => {
      const { providers, rows, service } = createSubject();
      await providers.replaceApiKeys('cherryin', [
        { id: 'manual', isEnabled: true, key: 'manual-key' },
      ]);
      mockExchangeCode.mockResolvedValue({ access_token: 'tok', refresh_token: 'r' });
      mockAfterPersist.mockResolvedValue({ apiKeys: 'minted-key' });

      await completeCherryInAuthorization(service);

      expect(rows.get('cherryin')?.apiKeys.map((entry) => entry.key)).toEqual([
        'manual-key',
        'minted-key',
      ]);
    });
  });

  describe('logout', () => {
    it('disables an OAuth-only provider but not one with a manual key', async () => {
      const { rows, seed, service } = createSubject();

      seed('codex', { accessToken: 'tok' });
      await service.logout('codex');
      expect(rows.get('codex')?.isEnabled).toBe(false);

      seed('cherryin', { accessToken: 'tok' });
      await service.logout('cherryin');
      expect(rows.get('cherryin')?.isEnabled).toBeUndefined();
    });

    it('drops minted API keys but keeps manually entered ones', async () => {
      const { providers, rows, seed, service } = createSubject();
      seed('cherryin', { accessToken: 'tok' });
      await providers.replaceApiKeys('cherryin', [
        { id: 'manual', isEnabled: true, key: 'manual-key' },
        { id: 'oauth-1', isEnabled: true, key: 'minted-key', label: 'OAuth' },
      ]);

      await service.logout('cherryin');

      expect(rows.get('cherryin')?.apiKeys.map((entry) => entry.key)).toEqual(['manual-key']);
    });

    it('clears the local session even when server-side revocation fails', async () => {
      const { rows, seed, service } = createSubject();
      seed('cherryin', { accessToken: 'tok' });
      const revokeToken = jest.fn().mockRejectedValue(new Error('revoke unavailable'));
      definitions.cherryin.revokeToken = revokeToken;

      await service.logout('cherryin');

      expect(revokeToken).toHaveBeenCalledWith('tok', {});
      expect(rows.get('cherryin')?.authConfig).toEqual({ type: 'api-key' });
      definitions.cherryin.revokeToken = undefined;
    });
  });

  describe('hasToken', () => {
    it('clears an expired session that has no refresh token', async () => {
      const { rows, seed, service } = createSubject();
      seed('codex', { accessToken: 'tok', expiresAt: PAST() });

      await expect(service.hasToken('codex')).resolves.toBe(false);
      expect(rows.get('codex')?.authConfig).toEqual({ type: 'api-key' });
    });

    it('reports true for a live session', async () => {
      const { seed, service } = createSubject();
      seed('codex', { accessToken: 'tok', expiresAt: FUTURE() });

      await expect(service.hasToken('codex')).resolves.toBe(true);
    });
  });

  it('rejects a provider that is not in the registry', async () => {
    const { service } = createSubject();

    await expect(service.hasToken('not-registered')).rejects.toThrow(
      'No OAuth provider is registered for not-registered',
    );
  });
});
