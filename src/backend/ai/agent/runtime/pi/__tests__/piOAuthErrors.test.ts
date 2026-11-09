import {
  configureOAuthPlatform,
  kimiCodingOAuth,
  openaiCodexOAuth,
  type OAuthCredential,
} from '@earendil-works/pi-ai/native-oauth';

import { HttpError } from '@/backend/services/http';
import { createProviderAccountFetch } from '@/backend/services/providers/account/providerAccountFetch';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http/createHttpClient', () => ({
  createHttpClient: jest.fn(() => ({ request: mockRequest })),
}));

const credential: OAuthCredential = {
  type: 'oauth',
  access: 'access-fixture',
  refresh: 'refresh-fixture',
  expires: 0,
};

beforeEach(() => {
  mockRequest.mockReset();
  configureOAuthPlatform({ fetch: createProviderAccountFetch() });
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
