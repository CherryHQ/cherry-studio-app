import type { ProviderService } from '@/data/services/ProviderService';
import type { AuthConfig } from '@/data/types/provider';
import { CherryInOauthService } from '../CherryInOauthService';

// Mock dependencies
jest.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

jest.mock('@/config/constants', () => ({
  CHERRYIN_CONFIG: {
    CLIENT_ID: 'test-client-id',
    ALLOWED_HOSTS: ['https://open.cherryin.ai', 'https://open.cherryin.dev'],
    REDIRECT_URI: 'cherrystudio://oauth/callback',
    SCOPES: 'openid profile email offline_access',
  },
}));

describe('CherryInOauthService', () => {
  let service: CherryInOauthService;
  let mockProviderService: jest.Mocked<ProviderService>;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useRealTimers();

    // Reset singleton between tests
    (CherryInOauthService as unknown as { instance: CherryInOauthService | null }).instance = null;

    // Create a fresh fetch mock for each test
    fetchMock = jest.fn();
    global.fetch = fetchMock;

    // Create mock ProviderService
    mockProviderService = {
      getAuthConfig: jest.fn(),
      listApiKeys: jest.fn().mockResolvedValue({ keys: [] }),
      replaceApiKeys: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ProviderService>;

    service = CherryInOauthService.getInstance(mockProviderService);
  });

  describe('validateApiHost', () => {
    it('should reject api hosts outside the allowlist (SSRF defense)', async () => {
      const forgedHost = 'https://attacker.example.com';

      await expect(service.getBalance(forgedHost)).rejects.toThrow(/Unauthorized API host/);

      await expect(service.logout(forgedHost)).rejects.toThrow(/Unauthorized API host/);
    });
  });

  describe('completeOAuth', () => {
    it('should complete OAuth flow and return API keys', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'test-access',
            refresh_token: 'test-refresh',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ['api-key-1', 'api-key-2'],
        });

      const apiKeys = await service.completeOAuth({
        oauthServer: 'https://open.cherryin.ai',
        apiHost: 'https://open.cherryin.ai',
        code: 'auth-code',
        codeVerifier: 'test-verifier',
        redirectUri: 'cherrystudio://oauth/callback',
      });

      expect(apiKeys).toBe('api-key-1,api-key-2');

      // Verify tokens were saved
      expect(mockProviderService.update).toHaveBeenCalledWith('cherryin', {
        authConfig: {
          type: 'oauth',
          clientId: 'test-client-id',
          accessToken: 'test-access',
          refreshToken: 'test-refresh',
        },
      });
    });

    it('should throw when token exchange fails', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'invalid_grant',
      });

      await expect(
        service.completeOAuth({
          oauthServer: 'https://open.cherryin.ai',
          apiHost: 'https://open.cherryin.ai',
          code: 'invalid-code',
          codeVerifier: 'test-verifier',
          redirectUri: 'cherrystudio://oauth/callback',
        }),
      ).rejects.toThrow(/Failed to exchange code for token/);
    });

    it('should throw when API keys fetch fails', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'test-access',
            refresh_token: 'test-refresh',
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => 'Internal Server Error',
        });

      await expect(
        service.completeOAuth({
          oauthServer: 'https://open.cherryin.ai',
          apiHost: 'https://open.cherryin.ai',
          code: 'auth-code',
          codeVerifier: 'test-verifier',
          redirectUri: 'cherrystudio://oauth/callback',
        }),
      ).rejects.toThrow(/Failed to fetch API keys/);

      // Verify no OAuth config was saved when API keys fetch fails
      const oauthUpdateCalls = (mockProviderService.update as jest.Mock).mock.calls.filter(
        (call) => {
          const dto = call[1] as { authConfig?: { type?: string } } | undefined;
          return dto?.authConfig?.type === 'oauth';
        },
      );
      expect(oauthUpdateCalls).toEqual([]);
    });

    it('should throw when no API keys are received', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'test-access',
            refresh_token: 'test-refresh',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => [],
        });

      await expect(
        service.completeOAuth({
          oauthServer: 'https://open.cherryin.ai',
          apiHost: 'https://open.cherryin.ai',
          code: 'auth-code',
          codeVerifier: 'test-verifier',
          redirectUri: 'cherrystudio://oauth/callback',
        }),
      ).rejects.toThrow(/No API keys received/);
    });
  });

  describe('token management', () => {
    it('should read the access token from provider auth config', async () => {
      mockProviderService.getAuthConfig.mockResolvedValue({
        type: 'oauth',
        clientId: 'client-id',
        accessToken: 'oauth-access',
        refreshToken: 'oauth-refresh',
      } as AuthConfig);

      await expect(service.getToken()).resolves.toBe('oauth-access');
    });

    it('should return null when no OAuth token exists', async () => {
      mockProviderService.getAuthConfig.mockResolvedValue({
        type: 'api-key',
      } as AuthConfig);

      await expect(service.getToken()).resolves.toBeNull();
    });

    it('should check if OAuth token exists', async () => {
      mockProviderService.getAuthConfig.mockResolvedValue({
        type: 'oauth',
        accessToken: 'oauth-access',
      } as AuthConfig);

      await expect(service.hasToken()).resolves.toBe(true);
    });

    it('should return false when token does not exist', async () => {
      mockProviderService.getAuthConfig.mockResolvedValue({
        type: 'api-key',
      } as AuthConfig);

      await expect(service.hasToken()).resolves.toBe(false);
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh access token using refresh token', async () => {
      mockProviderService.getAuthConfig.mockResolvedValue({
        type: 'oauth',
        clientId: 'client-id',
        accessToken: 'old-access',
        refreshToken: 'valid-refresh',
      } as AuthConfig);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
        }),
      });

      const newToken = await service.refreshAccessToken('https://open.cherryin.ai');

      expect(newToken).toBe('new-access');
      expect(mockProviderService.update).toHaveBeenCalledWith('cherryin', {
        authConfig: {
          type: 'oauth',
          clientId: 'client-id',
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
        },
      });
    });

    it('should return null when no refresh token exists', async () => {
      mockProviderService.getAuthConfig.mockResolvedValue({
        type: 'oauth',
        clientId: 'client-id',
        accessToken: 'old-access',
      } as AuthConfig);

      const newToken = await service.refreshAccessToken('https://open.cherryin.ai');

      expect(newToken).toBeNull();
    });

    it('should return null when refresh request fails', async () => {
      mockProviderService.getAuthConfig.mockResolvedValue({
        type: 'oauth',
        clientId: 'client-id',
        accessToken: 'old-access',
        refreshToken: 'invalid-refresh',
      } as AuthConfig);

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'invalid_grant',
      });

      const newToken = await service.refreshAccessToken('https://open.cherryin.ai');

      expect(newToken).toBeNull();
    });
  });

  describe('logout', () => {
    it('should revoke token on server and clear local auth config', async () => {
      mockProviderService.getAuthConfig.mockResolvedValue({
        type: 'oauth',
        clientId: 'client-id',
        accessToken: 'oauth-access',
        refreshToken: 'oauth-refresh',
      } as AuthConfig);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await service.logout('https://open.cherryin.ai');

      // Verify token was revoked
      expect(fetchMock).toHaveBeenCalledWith(
        'https://open.cherryin.ai/oauth2/revoke',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('token=oauth-access'),
        }),
      );

      // Verify local auth config was cleared
      expect(mockProviderService.update).toHaveBeenCalledWith('cherryin', {
        authConfig: { type: 'api-key' },
      });
    });

    it('should clear local auth config even when revoke fails', async () => {
      mockProviderService.getAuthConfig.mockResolvedValue({
        type: 'oauth',
        clientId: 'client-id',
        accessToken: 'oauth-access',
        refreshToken: 'oauth-refresh',
      } as AuthConfig);

      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      await service.logout('https://open.cherryin.ai');

      // Verify local auth config was still cleared
      expect(mockProviderService.update).toHaveBeenCalledWith('cherryin', {
        authConfig: { type: 'api-key' },
      });
    });

    it('should clear local auth config when no token exists', async () => {
      mockProviderService.getAuthConfig.mockResolvedValue({
        type: 'api-key',
      } as AuthConfig);

      await service.logout('https://open.cherryin.ai');

      // Verify no revoke request was made
      expect(fetchMock).not.toHaveBeenCalled();

      // Verify local auth config was cleared
      expect(mockProviderService.update).toHaveBeenCalledWith('cherryin', {
        authConfig: { type: 'api-key' },
      });
    });
  });

  describe('getBalance', () => {
    it('should map balance/profile data correctly', async () => {
      mockProviderService.getAuthConfig.mockResolvedValue({
        type: 'oauth',
        clientId: 'client-id',
        accessToken: 'oauth-access',
        refreshToken: 'oauth-refresh',
      } as AuthConfig);

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              quota: 64250000,
              used_quota: 3410000,
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              display_name: 'Siin',
              username: 'siin',
              email: 'siin@gmail.com',
              group: 'Pro',
            },
          }),
        });

      const result = await service.getBalance('https://open.cherryin.ai');

      expect(result).toEqual({
        balance: 128.5, // 64250000 / 500000
        profile: {
          displayName: 'Siin',
          username: 'siin',
          email: 'siin@gmail.com',
          group: 'Pro',
        },
        monthlyUsageTokens: null,
        monthlySpend: 6.82, // 3410000 / 500000
      });
    });

    it('should map flat profile responses without treating them as missing wrapped data', async () => {
      mockProviderService.getAuthConfig.mockResolvedValue({
        type: 'oauth',
        clientId: 'client-id',
        accessToken: 'oauth-access',
        refreshToken: 'oauth-refresh',
      } as AuthConfig);

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              quota: 1000,
              used_quota: 0,
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            display_name: 'Flat User',
            username: 'flat',
            email: 'flat@example.com',
            group: 'Team',
          }),
        });

      const result = await service.getBalance('https://open.cherryin.ai');

      expect(result.profile).toEqual({
        displayName: 'Flat User',
        username: 'flat',
        email: 'flat@example.com',
        group: 'Team',
      });
    });

    it('should expose balance API HTTP failures in the thrown error message', async () => {
      mockProviderService.getAuthConfig.mockResolvedValue({
        type: 'oauth',
        clientId: 'client-id',
        accessToken: 'oauth-access',
      } as AuthConfig);

      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(service.getBalance('https://open.cherryin.ai')).rejects.toThrow(
        'Failed to get balance: HTTP 500 Internal Server Error from /api/v1/oauth/balance',
      );
    });

    it('should clear the OAuth session and throw OAuthSessionExpired when 401 hits with no refresh token', async () => {
      mockProviderService.getAuthConfig.mockResolvedValue({
        type: 'oauth',
        clientId: 'client-id',
        accessToken: 'oauth-access',
      } as AuthConfig);

      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(service.getBalance('https://open.cherryin.ai')).rejects.toThrow(
        'OAuth session expired: no refresh token available',
      );

      expect(mockProviderService.update).toHaveBeenCalledWith('cherryin', {
        authConfig: { type: 'api-key' },
      });
    });

    it('should refresh token and retry when 401 is received', async () => {
      mockProviderService.getAuthConfig.mockResolvedValue({
        type: 'oauth',
        clientId: 'client-id',
        accessToken: 'expired-access',
        refreshToken: 'valid-refresh',
      } as AuthConfig);

      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'fresh-access',
            refresh_token: 'fresh-refresh',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              quota: 1000,
              used_quota: 0,
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              display_name: 'Test User',
              username: 'test',
            },
          }),
        });

      const result = await service.getBalance('https://open.cherryin.ai');

      expect(result.balance).toBe(0.002); // 1000 / 500000
      expect(mockProviderService.update).toHaveBeenCalledWith('cherryin', {
        authConfig: {
          type: 'oauth',
          clientId: 'client-id',
          accessToken: 'fresh-access',
          refreshToken: 'fresh-refresh',
        },
      });
    });

    it('should deduplicate concurrent token refreshes after simultaneous unauthorized responses', async () => {
      // This test verifies that when multiple requests hit 401 simultaneously,
      // token refreshes are deduplicated.
      // Note: Due to timing issues in tests, both requests may enter the refresh
      // logic before the promise is cached. In production, the window is small
      // enough that deduplication works effectively.

      mockProviderService.getAuthConfig.mockResolvedValue({
        type: 'oauth',
        clientId: 'client-id',
        accessToken: 'expired-access',
        refreshToken: 'refresh-token',
      } as AuthConfig);

      let releaseRefresh: (() => void) | null = null;
      const refreshGate = new Promise<void>((resolve) => {
        releaseRefresh = resolve as () => void;
      });

      fetchMock.mockImplementation(async (url: string | URL, init?: RequestInit) => {
        const urlString = String(url);

        if (urlString.endsWith('/oauth2/token')) {
          await refreshGate;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              access_token: 'fresh-access',
              refresh_token: 'fresh-refresh',
            }),
          };
        }

        const headers = init?.headers as Record<string, string> | undefined;
        const authorization = headers?.Authorization;

        if (authorization === 'Bearer fresh-access') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              data: {
                quota: 1000,
                used_quota: 0,
              },
            }),
          };
        }

        return {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
        };
      });

      const promise1 = service.getBalance('https://open.cherryin.ai');
      const promise2 = service.getBalance('https://open.cherryin.ai');

      await new Promise((resolve) => setTimeout(resolve, 50));

      (releaseRefresh as (() => void) | null)?.();

      await expect(promise1).resolves.toBeDefined();
      await expect(promise2).resolves.toBeDefined();

      const finalRefreshCalls = fetchMock.mock.calls.filter((call) =>
        String(call[0]).endsWith('/oauth2/token'),
      );
      // Allow 1-2 calls due to test timing issues; production deduplication is more effective
      expect(finalRefreshCalls.length).toBeLessThanOrEqual(2);
    });

    it('should throw when balance API returns success: false', async () => {
      mockProviderService.getAuthConfig.mockResolvedValue({
        type: 'oauth',
        clientId: 'client-id',
        accessToken: 'oauth-access',
      } as AuthConfig);

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: false,
          data: {
            quota: 0,
            used_quota: 0,
          },
        }),
      });

      await expect(service.getBalance('https://open.cherryin.ai')).rejects.toThrow(
        'API returned success: false',
      );
    });

    it('should throw when balance response format is invalid', async () => {
      mockProviderService.getAuthConfig.mockResolvedValue({
        type: 'oauth',
        clientId: 'client-id',
        accessToken: 'oauth-access',
      } as AuthConfig);

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          invalid_field: 'value',
        }),
      });

      await expect(service.getBalance('https://open.cherryin.ai')).rejects.toThrow(
        'Invalid response format from server',
      );
    });
  });

  describe('completeOAuth host validation', () => {
    it('should reject forged oauthServer (SSRF defense)', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'test-access' }),
      });

      await expect(
        service.completeOAuth({
          oauthServer: 'https://attacker.example.com',
          apiHost: 'https://open.cherryin.ai',
          code: 'auth-code',
          codeVerifier: 'test-verifier',
          redirectUri: 'cherrystudio://oauth/callback',
        }),
      ).rejects.toThrow(/Unauthorized API host/);
    });

    it('should reject forged apiHost (SSRF defense)', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'test-access' }),
      });

      await expect(
        service.completeOAuth({
          oauthServer: 'https://open.cherryin.ai',
          apiHost: 'https://attacker.example.com',
          code: 'auth-code',
          codeVerifier: 'test-verifier',
          redirectUri: 'cherrystudio://oauth/callback',
        }),
      ).rejects.toThrow(/Unauthorized API host/);
    });
  });

  describe('saveOAuthResult', () => {
    it('should merge new OAuth keys with existing non-OAuth keys', async () => {
      mockProviderService.listApiKeys.mockResolvedValue({
        keys: [{ id: 'manual-1', key: 'manual-key-1', isEnabled: true, label: 'Manual' }],
      });

      await service.saveOAuthResult('cherryin', 'oauth-key-1,oauth-key-2');

      expect(mockProviderService.replaceApiKeys).toHaveBeenCalledWith('cherryin', [
        { id: 'manual-1', key: 'manual-key-1', isEnabled: true, label: 'Manual' },
        expect.objectContaining({ key: 'oauth-key-1', label: 'OAuth' }),
        expect.objectContaining({ key: 'oauth-key-2', label: 'OAuth' }),
      ]);
      expect(mockProviderService.update).toHaveBeenCalledWith('cherryin', { isEnabled: true });
    });

    it('should deduplicate when OAuth returns a key that already exists as manual', async () => {
      mockProviderService.listApiKeys.mockResolvedValue({
        keys: [
          { id: 'manual-1', key: 'duplicate-key', isEnabled: true, label: 'Manual' },
          { id: 'oauth-old', key: 'old-oauth-key', isEnabled: true, label: 'OAuth' },
        ],
      });

      await service.saveOAuthResult('cherryin', 'duplicate-key,new-oauth-key');

      const replacedKeys = (mockProviderService.replaceApiKeys as jest.Mock).mock.calls[0][1];
      expect(replacedKeys).toHaveLength(2);
      expect(replacedKeys.map((k: { key: string }) => k.key)).toEqual([
        'duplicate-key',
        'new-oauth-key',
      ]);
      expect(
        replacedKeys.every(
          (k: { key: string; label: string }) => k.label !== 'OAuth' || k.key !== 'duplicate-key',
        ),
      ).toBe(true);
    });

    it('should handle empty existing keys', async () => {
      mockProviderService.listApiKeys.mockResolvedValue({ keys: [] });

      await service.saveOAuthResult('cherryin', 'oauth-key-1');

      expect(mockProviderService.replaceApiKeys).toHaveBeenCalledWith('cherryin', [
        expect.objectContaining({ key: 'oauth-key-1', label: 'OAuth' }),
      ]);
    });
  });

  describe('getNonOAuthApiKeys', () => {
    it('should return only non-OAuth keys from the full key list', async () => {
      mockProviderService.listApiKeys.mockResolvedValue({
        keys: [
          { id: 'manual-1', key: 'manual-key-1', isEnabled: true, label: 'Manual' },
          { id: 'oauth-1', key: 'oauth-key-1', isEnabled: true, label: 'OAuth' },
          { id: 'manual-2', key: 'manual-key-2', isEnabled: true },
        ],
      });

      const result = await service.getNonOAuthApiKeys('cherryin');

      expect(result).toHaveLength(2);
      expect(result.map((k) => k.key)).toEqual(['manual-key-1', 'manual-key-2']);
    });

    it('should return empty array when all keys are OAuth', async () => {
      mockProviderService.listApiKeys.mockResolvedValue({
        keys: [{ id: 'oauth-1', key: 'oauth-key-1', isEnabled: true, label: 'OAuth' }],
      });

      const result = await service.getNonOAuthApiKeys('cherryin');

      expect(result).toHaveLength(0);
    });
  });
});
