import { createHttpClient, HttpError } from '@/backend/services/http';

import { AuthorizationError, discoverRemoteAgent, fetchSnapshot } from '../desktopConnectionClient';

jest.mock('@/backend/services/http', () => ({
  ...jest.requireActual('@/backend/services/http'),
  createHttpClient: jest.fn(),
}));
jest.mock('@/backend/utils/defaultAppHeaders', () => ({ defaultAppHeaders: () => ({}) }));
const request = jest.fn();
const addresses = ['http://192.168.1.2', 'http://192.168.1.3'];

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(createHttpClient).mockReturnValue({ request });
});

describe('desktop HTTP policy', () => {
  it('tries another paired address after the shared transport times out', async () => {
    request.mockRejectedValueOnce(new HttpError('timeout', { kind: 'timeout' }));
    request.mockResolvedValueOnce({ data: { version: 1, providers: [] } });
    await expect(
      fetchSnapshot(addresses, 'token', new AbortController().signal),
    ).resolves.toMatchObject({
      baseUrl: addresses[1],
      payload: { version: 1, providers: [] },
    });
    expect(createHttpClient).toHaveBeenNthCalledWith(2, {
      baseUrl: addresses[1],
      timeoutMs: 4000,
      headers: { Authorization: 'Bearer token' },
    });
  });

  it('cancels without trying the next address', async () => {
    const caller = new AbortController();
    request.mockImplementationOnce(async () => {
      caller.abort();
      throw new HttpError('cancelled', { kind: 'cancelled' });
    });
    await expect(fetchSnapshot(addresses, 'token', caller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not retry revoked authorization on another address', async () => {
    request.mockRejectedValueOnce(new HttpError('revoked', { kind: 'http', status: 403 }));
    await expect(
      fetchSnapshot(addresses, 'token', new AbortController().signal),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('binds credentials to the selected route and prohibits redirects', async () => {
    request.mockResolvedValueOnce({ data: { version: 1, providers: [] } });
    const caller = new AbortController();
    await fetchSnapshot(addresses, 'token', caller.signal);
    expect(createHttpClient).toHaveBeenCalledWith({
      baseUrl: addresses[0],
      timeoutMs: 4000,
      headers: { Authorization: 'Bearer token' },
    });
    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/v1/export/providers',
      signal: caller.signal,
      redirect: 'error',
      maxResponseBytes: 16 * 1024 * 1024,
    });
  });

  it('does not start a request for an already cancelled caller', async () => {
    const caller = new AbortController();
    caller.abort();
    await expect(fetchSnapshot(addresses, 'token', caller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(createHttpClient).not.toHaveBeenCalled();
  });

  it('keeps service unavailability distinct from revoked pairing', async () => {
    request.mockRejectedValueOnce(new HttpError('disabled', { kind: 'http', status: 503 }));
    await expect(
      discoverRemoteAgent(addresses, 'token', new AbortController().signal),
    ).rejects.toMatchObject({ details: { reason: 'agent-unavailable' } });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
