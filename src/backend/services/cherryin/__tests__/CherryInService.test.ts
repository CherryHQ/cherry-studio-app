import type { CherryInBackend } from '@/shared/contracts';

import { CherryInService, type CherryInServiceDependencies } from '../CherryInService';

function createSubject() {
  const dependencies: CherryInServiceDependencies = {
    oauth: {
      authenticatedFetch: jest.fn(async () => new Response()),
      hasToken: jest.fn(async () => true),
    },
  };
  const backend: CherryInBackend = new CherryInService(dependencies);

  /** Answer each endpoint the balance path touches, in call order. */
  const respondWith = (responses: Record<string, unknown>) => {
    jest
      .mocked(dependencies.oauth.authenticatedFetch)
      .mockImplementation(async (_providerId, buildRequest) => {
        const { input } = buildRequest({ accessToken: 'tok' });
        const endpoint = Object.keys(responses).find((key) => String(input).includes(key));

        return {
          json: async () => responses[endpoint ?? ''],
          ok: endpoint !== undefined,
          status: endpoint === undefined ? 404 : 200,
        } as Response;
      });
  };

  return { backend, dependencies, respondWith };
}

const balancePayload = { data: { quota: 1_000_000, used_quota: 500_000 }, success: true };

describe('CherryInService', () => {
  it('does not call the API without a stored OAuth session', async () => {
    const { backend, dependencies } = createSubject();
    jest.mocked(dependencies.oauth.hasToken).mockResolvedValue(false);

    await expect(backend.getBalance()).resolves.toBeNull();
    expect(dependencies.oauth.authenticatedFetch).not.toHaveBeenCalled();
  });

  it('converts quota units into balance and monthly spend', async () => {
    const { backend, respondWith } = createSubject();
    respondWith({
      '/api/user/self': { data: { display_name: 'Ada', email: 'ada@example.com' } },
      '/api/v1/oauth/balance': balancePayload,
    });

    await expect(backend.getBalance()).resolves.toEqual({
      balance: 2,
      monthlySpend: 1,
      monthlyUsageTokens: null,
      profile: { displayName: 'Ada', email: 'ada@example.com', group: null, username: null },
    });
  });

  it('still reports the balance when the profile lookup fails', async () => {
    const { backend, respondWith } = createSubject();
    respondWith({ '/api/v1/oauth/balance': balancePayload });

    await expect(backend.getBalance()).resolves.toMatchObject({ balance: 2, profile: null });
  });

  it('rejects a host outside the allowlist before issuing any request', async () => {
    const { backend, dependencies } = createSubject();

    await expect(backend.getBalance('https://open.cherryin.ai.evil.com')).rejects.toThrow(
      'Unauthorized API host',
    );
    expect(dependencies.oauth.hasToken).not.toHaveBeenCalled();
  });

  it('accepts the secondary allowlisted host', async () => {
    const { backend, respondWith } = createSubject();
    respondWith({ '/api/v1/oauth/balance': balancePayload });

    await expect(backend.getBalance('https://open.cherryin.dev')).resolves.toMatchObject({
      balance: 2,
    });
  });

  it('surfaces an API-level failure flag', async () => {
    const { backend, respondWith } = createSubject();
    respondWith({ '/api/v1/oauth/balance': { data: { quota: 0, used_quota: 0 }, success: false } });

    await expect(backend.getBalance()).rejects.toThrow('API returned success: false');
  });

  it('reports an unparseable balance response as a parse error', async () => {
    const { backend, respondWith } = createSubject();
    respondWith({ '/api/v1/oauth/balance': { unexpected: true } });

    await expect(backend.getBalance()).rejects.toThrow('Invalid response format from server');
  });
});
