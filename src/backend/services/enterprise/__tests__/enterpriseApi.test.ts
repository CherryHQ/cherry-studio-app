import { createHttpClient, HttpError, type HttpResponse } from '@/backend/services/http';

import { createEnterpriseApi } from '../enterpriseApi';

jest.mock('@/backend/services/http', () => ({
  ...jest.requireActual('@/backend/services/http/HttpError'),
  createHttpClient: jest.fn(),
}));

const unauthorized = () => new HttpError('Unauthorized', { kind: 'http', status: 401 });

function setup() {
  const request = jest.fn<Promise<HttpResponse<unknown>>, [unknown]>();
  jest.mocked(createHttpClient).mockReturnValue({ request } as ReturnType<typeof createHttpClient>);
  const refreshToken = jest.fn(async () => 'new-token');
  const api = createEnterpriseApi({
    baseUrl: 'https://private.example.com/api',
    getToken: async () => 'old-token',
    refreshToken,
  });
  return { api, request, refreshToken };
}

describe('enterprise API authentication', () => {
  it('retries a rejected request once with the rotated token on the same route', async () => {
    const { api, request, refreshToken } = setup();
    request
      .mockRejectedValueOnce(unauthorized())
      .mockResolvedValueOnce({ data: { serverUniqueId: 'private' }, status: 200, headers: {} });
    await expect(api.getConfiguration()).resolves.toEqual({ serverUniqueId: 'private' });
    expect(refreshToken).toHaveBeenCalledWith('old-token');
    expect(request.mock.calls.map(([input]) => input)).toEqual([
      expect.objectContaining({
        path: '/configurations',
        credentials: 'omit',
        redirect: 'error',
        headers: { Authorization: 'Bearer old-token' },
      }),
      expect.objectContaining({
        path: '/configurations',
        credentials: 'omit',
        redirect: 'error',
        headers: { Authorization: 'Bearer new-token' },
      }),
    ]);
  });

  it('stops after the server rejects the refreshed token', async () => {
    const { api, request, refreshToken } = setup();
    request.mockRejectedValue(unauthorized());
    await expect(api.getUser()).rejects.toMatchObject({ status: 401 });
    expect(request).toHaveBeenCalledTimes(2);
    expect(refreshToken).toHaveBeenCalledTimes(1);
  });

  it('does not refresh or replay a forbidden request', async () => {
    const { api, request, refreshToken } = setup();
    request.mockRejectedValue(new HttpError('Forbidden', { kind: 'http', status: 403 }));
    await expect(api.setupAgent(1)).rejects.toMatchObject({ status: 403 });
    expect(request).toHaveBeenCalledTimes(1);
    expect(refreshToken).not.toHaveBeenCalled();
  });
});
