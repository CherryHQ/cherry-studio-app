import {
  configureOAuthPlatform,
  kimiCodingOAuth,
  openaiCodexOAuth,
  type OAuthCredential,
} from '@earendil-works/pi-ai/native-oauth';

import { HttpError } from '@/backend/services/http';
import { createProviderAccountFetch } from '@/backend/services/providers/account/providerAccountFetch';
import {
  providerAccountStorage,
  type StoredPiAccount,
} from '@/backend/services/providers/account/providerAccountStorage';
import { createPkceChallenge } from '@/backend/utils/oauth';
import { ProviderAccountError } from '@/shared/contracts/providerAccounts';

import { PiProviderAccountAdapter } from '../PiProviderAccountAdapter';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http/createHttpClient', () => ({
  createHttpClient: jest.fn(() => ({ request: mockRequest })),
}));
jest.mock('@/backend/services/providers/account/providerAccountStorage', () => ({
  providerAccountStorage: { readPiAccount: jest.fn(), writePiAccount: jest.fn() },
}));

const credential: OAuthCredential = {
  type: 'oauth',
  access: 'access-fixture',
  refresh: 'refresh-fixture',
  expires: 0,
};

beforeEach(() => {
  mockRequest.mockReset();
  configureOAuthPlatform({
    fetch: createProviderAccountFetch(),
    generatePKCE: createPkceChallenge,
  });
});

it.each(['authorization', 'network'] as const)(
  'retains the original %s failure through the installed Codex refresh flow',
  async (failure) => {
    const details =
      failure === 'authorization'
        ? { kind: 'http' as const, status: 400, code: 'invalid_grant' }
        : { kind: 'network' as const };
    if (failure === 'authorization') {
      mockRequest.mockResolvedValueOnce({
        status: 400,
        headers: {},
        data: JSON.stringify({
          error: 'invalid_grant',
          error_description: 'secret-server-response',
        }),
      });
    } else {
      mockRequest.mockRejectedValueOnce(new HttpError('Provider request failed.', details));
    }
    await expect(
      openaiCodexOAuth.refresh(credential, new AbortController().signal),
    ).rejects.toMatchObject({ cause: expect.objectContaining(details) });
  },
);

it('does not retry a confirmed invalid grant through the installed Kimi refresh flow', async () => {
  mockRequest.mockResolvedValue({
    status: 400,
    headers: {},
    data: JSON.stringify({ error: 'invalid_grant' }),
  });
  await expect(
    kimiCodingOAuth.refresh(credential, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'invalid_grant', status: 400 });
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

it.each([
  ['credential-exchange', 'authorization', false],
  ['model-catalog', 'request', true],
] as const)(
  'invalidates a Copilot grant only when its credential exchange is rejected: %s',
  async (stage, reason, retained) => {
    let account: StoredPiAccount | null = {
      definitionId: 'github-copilot',
      providerCreatedAt: 100,
      updatedAt: 100,
      credential: { ...credential },
    };
    jest.mocked(providerAccountStorage.readPiAccount).mockImplementation(async () => account);
    jest.mocked(providerAccountStorage.writePiAccount).mockImplementation(async (_id, next) => {
      account = next;
    });
    const adapter = new PiProviderAccountAdapter();
    adapter.configure({
      get: async (id) => ({ id, presetProviderId: 'copilot', name: id, createdAt: 100 }),
    });
    const tokenResponse = {
      status: 200,
      headers: {},
      data: JSON.stringify({ token: 'new-copilot-token', expires_at: Date.now() / 1000 + 3600 }),
    };
    if (stage === 'model-catalog') mockRequest.mockResolvedValueOnce(tokenResponse);
    mockRequest.mockResolvedValueOnce({ status: 401, headers: {}, data: 'Unauthorized' });

    await expect(adapter.refresh('copilot')).rejects.toEqual(new ProviderAccountError(reason));
    expect((await adapter.getStatus('copilot')).signedIn).toBe(retained);
    if (retained) {
      expect(account?.credential.refresh).toBe(credential.refresh);
      mockRequest.mockResolvedValueOnce(tokenResponse).mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: JSON.stringify({ data: [{ id: 'gpt-4.1', model_picker_enabled: true }] }),
      });
      await expect(adapter.refresh('copilot')).resolves.toMatchObject({ signedIn: true });
      expect(account?.credential.access).toBe('new-copilot-token');
      expect(account?.credential.refresh).toBe(credential.refresh);
    } else {
      await expect(adapter.refresh('copilot')).resolves.toMatchObject({ signedIn: false });
      expect(mockRequest).toHaveBeenCalledTimes(1);
    }
  },
);
