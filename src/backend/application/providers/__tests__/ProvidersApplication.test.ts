import type { ProvidersBackend } from '@/shared/contracts';
import type { Provider } from '@/shared/data/types/provider';
import {
  ProvidersApplication,
  type ProvidersApplicationDependencies,
} from '../ProvidersApplication';

const provider = { id: 'cherryin', isEnabled: false } as Provider;

function createSubject() {
  const dependencies: ProvidersApplicationDependencies = {
    avatars: {
      persist: jest.fn(async () => 'file:///avatar'),
      resolve: jest.fn(() => 'file:///avatar'),
    },
    oauth: {
      complete: jest.fn(async () => 'oauth-key'),
      getAccount: jest.fn(async () => ({
        balance: 10,
        monthlySpend: 2,
        monthlyUsageTokens: null,
        profile: null,
      })),
      getNonOAuthApiKeys: jest.fn(async () => [
        { id: 'manual', isEnabled: true, key: 'manual-key' },
      ]),
      logout: jest.fn(async () => undefined),
      saveResult: jest.fn(async () => undefined),
    },
    providers: {
      create: jest.fn(async () => provider),
      get: jest.fn(async () => provider),
      getAuth: jest.fn(async () => ({
        accessToken: 'token',
        clientId: 'client',
        type: 'oauth' as const,
      })),
      list: jest.fn(async () => [provider]),
      listApiKeys: jest.fn(async () => []),
      remove: jest.fn(async () => undefined),
      replaceApiKeys: jest.fn(async () => provider),
      update: jest.fn(async () => provider),
      updateApiKey: jest.fn(async () => provider),
    },
  };
  const backend: ProvidersBackend = new ProvidersApplication(dependencies);
  return { backend, dependencies };
}

describe('ProvidersApplication', () => {
  it('persists the OAuth result after completing the CherryIN exchange', async () => {
    const { backend, dependencies } = createSubject();
    const input = {
      apiHost: 'https://open.cherryin.ai',
      code: 'code',
      codeVerifier: 'verifier',
      oauthServer: 'https://open.cherryin.ai',
      redirectUri: 'cherrystudio://oauth/callback',
    };

    await backend.completeCherryInOAuth(input);

    expect(dependencies.oauth.complete).toHaveBeenCalledWith(input);
    expect(dependencies.oauth.saveResult).toHaveBeenCalledWith('cherryin', 'oauth-key');
  });

  it('clears OAuth keys after logging out', async () => {
    const { backend, dependencies } = createSubject();

    await backend.logoutCherryIn('https://open.cherryin.ai');

    expect(dependencies.oauth.logout).toHaveBeenCalled();
    expect(dependencies.providers.replaceApiKeys).toHaveBeenCalledWith('cherryin', [
      { id: 'manual', isEnabled: true, key: 'manual-key' },
    ]);
  });

  it('does not fetch an account without a stored OAuth token', async () => {
    const { backend, dependencies } = createSubject();
    jest.mocked(dependencies.providers.getAuth).mockResolvedValue({ type: 'api-key' });

    await expect(backend.getCherryInAccount('https://open.cherryin.ai')).resolves.toBeNull();
    expect(dependencies.oauth.getAccount).not.toHaveBeenCalled();
  });
});
