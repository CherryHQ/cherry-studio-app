import { createHttpClient, type HttpResponse } from '@/backend/services/http';

import { createPrivateAccountApi } from '../privateAccountApi';

jest.mock('@/backend/services/http', () => ({ createHttpClient: jest.fn() }));

describe('private account protocol', () => {
  const request = jest.fn<Promise<HttpResponse<unknown>>, [unknown]>();
  beforeEach(() => {
    request.mockReset();
    jest
      .mocked(createHttpClient)
      .mockReturnValue({ request } as ReturnType<typeof createHttpClient>);
  });

  it('uses the v2 password endpoint and accepts its token spelling and numeric user id', async () => {
    request.mockResolvedValue({
      data: { access_token: 'access', refresh_token: 'refresh', user: { id: 42, username: 'Ada' } },
      status: 200,
      headers: {},
    });
    const api = createPrivateAccountApi('https://private.example.com/api');
    await expect(api.signIn('Ada', 'secret')).resolves.toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      serverUniqueId: null,
      user: { id: '42', username: 'Ada' },
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/auth/login',
        method: 'POST',
        body: { username: 'Ada', password: 'secret' },
        credentials: 'omit',
        redirect: 'error',
      }),
    );
  });

  it('refreshes with the refresh token in the body and no password or browser session', async () => {
    request.mockResolvedValue({
      data: { accessToken: 'next', user: { id: '42' } },
      status: 200,
      headers: {},
    });
    const api = createPrivateAccountApi('https://private.example.com');
    await expect(api.refresh('refresh')).resolves.toMatchObject({
      accessToken: 'next',
      refreshToken: null,
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/auth/refresh', body: { refreshToken: 'refresh' } }),
    );
  });

  it('rejects malformed authentication responses without exposing their content', async () => {
    request.mockResolvedValue({
      data: { accessToken: 'secret', user: {} },
      status: 200,
      headers: {},
    });
    const api = createPrivateAccountApi('https://private.example.com');
    await expect(api.signIn('Ada', 'secret')).rejects.toMatchObject({
      code: 'response',
      message: 'Account response',
    });
  });
});
