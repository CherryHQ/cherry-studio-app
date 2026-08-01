import type { AuthConfig } from '@cherrystudio/universal/data/types/provider';
import {
  ProviderAuthConfigOAuthTokenStore,
  type OAuthTokenStoreProviderRepository,
} from '../OAuthTokenStore';

function createSubject() {
  const providers: jest.Mocked<OAuthTokenStoreProviderRepository> = {
    getAuthConfig: jest.fn(async (_providerId: string) => null as AuthConfig | null),
    update: jest.fn(
      async (_providerId: string, _input: { authConfig?: AuthConfig; isEnabled?: boolean }) =>
        undefined,
    ),
  };

  return { providers, store: new ProviderAuthConfigOAuthTokenStore(providers) };
}

describe('ProviderAuthConfigOAuthTokenStore', () => {
  it('reads only oauth-typed auth config', async () => {
    const { providers, store } = createSubject();

    providers.getAuthConfig.mockResolvedValueOnce({ type: 'api-key' });
    await expect(store.get('p')).resolves.toBeNull();

    providers.getAuthConfig.mockResolvedValueOnce({
      accessToken: 'a',
      accountId: 'acc',
      clientId: 'c',
      expiresAt: 123,
      refreshToken: 'r',
      type: 'oauth',
    });
    await expect(store.get('p')).resolves.toEqual({
      accessToken: 'a',
      accountId: 'acc',
      expiresAt: 123,
      refreshToken: 'r',
    });
  });

  it('writes the oauth session for an initial sign-in even when no session exists yet', async () => {
    const { providers, store } = createSubject();

    await store.set('codex', { accessToken: 'a', refreshToken: 'r' }, 'client-1');

    expect(providers.update).toHaveBeenCalledWith('codex', {
      authConfig: { accessToken: 'a', clientId: 'client-1', refreshToken: 'r', type: 'oauth' },
    });
  });

  it('skips the write when the session was cleared mid-refresh', async () => {
    // A logout during an in-flight refresh flips authConfig to api-key; the late
    // refresh must NOT resurrect the session with its now-stale token.
    const { providers, store } = createSubject();
    providers.getAuthConfig.mockResolvedValue({ type: 'api-key' });

    await store.set('codex', { accessToken: 'stale', refreshToken: 'r2' }, 'client-1', {
      expectedRefreshToken: 'r',
    });

    expect(providers.update).not.toHaveBeenCalled();
  });

  it('skips the write when a re-login replaced the session mid-refresh', async () => {
    // logout → re-login installs a NEW oauth session (different refresh token).
    // The stale refresh must not clobber it, even though the type is oauth again.
    const { providers, store } = createSubject();
    providers.getAuthConfig.mockResolvedValue({
      clientId: 'client-1',
      refreshToken: 'r-new',
      type: 'oauth',
    });

    await store.set('codex', { accessToken: 'stale', refreshToken: 'r2' }, 'client-1', {
      expectedRefreshToken: 'r-old',
    });

    expect(providers.update).not.toHaveBeenCalled();
  });

  it('updates the session it refreshed from', async () => {
    const { providers, store } = createSubject();
    providers.getAuthConfig.mockResolvedValue({
      accessToken: 'old',
      clientId: 'client-1',
      refreshToken: 'r',
      type: 'oauth',
    });

    await store.set('codex', { accessToken: 'fresh', refreshToken: 'r2' }, 'client-1', {
      expectedRefreshToken: 'r',
    });

    expect(providers.update).toHaveBeenCalledWith('codex', {
      authConfig: { accessToken: 'fresh', clientId: 'client-1', refreshToken: 'r2', type: 'oauth' },
    });
  });

  it('skips a conditional clear when a re-login replaced the session', async () => {
    const { providers, store } = createSubject();
    providers.getAuthConfig.mockResolvedValue({
      clientId: 'client-1',
      refreshToken: 'r-new',
      type: 'oauth',
    });

    await store.clear('codex', { disableProvider: true, expectedRefreshToken: 'r-old' });

    expect(providers.update).not.toHaveBeenCalled();
  });

  it('drops tokens but does NOT disable the provider by default (preserves a manual API key)', async () => {
    const { providers, store } = createSubject();

    await store.clear('cherryin');

    expect(providers.update).toHaveBeenCalledWith('cherryin', { authConfig: { type: 'api-key' } });
    expect(providers.update.mock.calls[0][1]).not.toHaveProperty('isEnabled');
  });

  it('also disables the provider for OAuth-only providers', async () => {
    const { providers, store } = createSubject();

    await store.clear('codex', { disableProvider: true });

    expect(providers.update).toHaveBeenCalledWith('codex', {
      authConfig: { type: 'api-key' },
      isEnabled: false,
    });
  });

  // Mobile-specific: desktop gets this for free because its reads and writes are
  // synchronous. Here they are async, so without the store's serialization the
  // second operation would read the pre-clear session and pass its check.
  it('serializes mutations so a clear cannot interleave a compare-and-write', async () => {
    const { providers, store } = createSubject();
    let stored: AuthConfig | null = {
      accessToken: 'old',
      clientId: 'client-1',
      refreshToken: 'r',
      type: 'oauth',
    };

    // Snapshot at call time, resolve later — how a real query behaves, and
    // exactly the window an unserialized implementation loses to.
    providers.getAuthConfig.mockImplementation(() => {
      const snapshot = stored;
      return new Promise((resolve) => setTimeout(() => resolve(snapshot), 0));
    });
    providers.update.mockImplementation(async (_providerId, input) => {
      stored = input.authConfig ?? stored;
      return undefined;
    });

    // A refresh commits its result...
    const refresh = store.set('codex', { accessToken: 'stale' }, 'client-1', {
      expectedRefreshToken: 'r',
    });
    // ...and a logout lands while that compare-and-write is still in flight.
    const logout = store.clear('codex');

    await Promise.all([refresh, logout]);

    // Unserialized, the refresh resumes holding a pre-logout snapshot, passes
    // its compare, and resurrects the session the user just signed out of.
    expect(stored).toEqual({ type: 'api-key' });
  });
});
