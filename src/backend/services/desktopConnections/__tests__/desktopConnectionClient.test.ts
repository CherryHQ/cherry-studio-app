import { loggerService } from '@logger';
import { fetch as expoFetch } from 'expo/fetch';

import { fetchSnapshot, pairDesktop, requestWithTimeout } from '../desktopConnectionClient';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('@/backend/utils/defaultAppHeaders', () => ({ defaultAppHeaders: () => ({}) }));
// Keeps pairing on the ordinary transport instead of the iOS-only native POST.
jest.mock('../../../../../modules/local-network-access', () => ({
  getLocalNetworkAccess: () => null,
}));

const mockFetch = jest.mocked(expoFetch);

function stalledBody() {
  mockFetch.mockImplementationOnce(
    async (_url, init) =>
      ({
        ok: true,
        status: 200,
        json: () =>
          new Promise((_resolve, reject) => {
            init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), {
              once: true,
            });
          }),
      }) as Response as Awaited<ReturnType<typeof expoFetch>>,
  );
}

describe('desktop connection request lifetime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps the deadline active after headers arrive until the body is read', async () => {
    stalledBody();
    const request = requestWithTimeout(
      'http://192.168.1.2/providers',
      {},
      (response) => response.json(),
      new AbortController().signal,
    );
    const assertion = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await jest.advanceTimersByTimeAsync(4_000);
    await assertion;
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cancels a stalled body without trying the next desktop address', async () => {
    stalledBody();
    const controller = new AbortController();
    const request = fetchSnapshot(
      ['http://192.168.1.2', 'http://192.168.1.3'],
      'token',
      controller.signal,
    );
    const assertion = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await jest.advanceTimersByTimeAsync(0);
    controller.abort();
    await assertion;
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('prohibits redirects and releases the timer after a successful body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ version: 1, providers: [] }),
    } as Response as Awaited<ReturnType<typeof expoFetch>>);
    const controller = new AbortController();
    const removeListener = jest.spyOn(controller.signal, 'removeEventListener');
    await expect(
      fetchSnapshot(['http://192.168.1.2'], 'token', controller.signal),
    ).resolves.toMatchObject({ payload: { version: 1, providers: [] } });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://192.168.1.2/v1/export/providers',
      expect.objectContaining({ redirect: 'error', headers: { Authorization: 'Bearer token' } }),
    );
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(jest.getTimerCount()).toBe(0);
    removeListener.mockRestore();
  });

  it('names every address failure before collapsing them into one unreachable error', async () => {
    const reported = jest.spyOn(loggerService, 'error').mockImplementation(() => undefined);
    mockFetch.mockRejectedValueOnce(new TypeError('Network request failed'));
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 } as Response as Awaited<
      ReturnType<typeof expoFetch>
    >);
    await expect(
      fetchSnapshot(
        ['http://192.168.1.2', 'http://192.168.1.3'],
        'token',
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ details: { reason: 'unreachable' } });
    // An `operation` is what routes the report to Sentry in production builds.
    expect(reported).toHaveBeenCalledWith(expect.any(String), expect.any(Error), {
      attempts: ['TypeError', 'http-500'],
      operation: 'desktop.snapshot.fetch',
    });
    reported.mockRestore();
  });

  it('does not start a request for an already cancelled caller', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchSnapshot(['http://192.168.1.2'], 'token', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('pairing response tolerance', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  function respondWith(payload: Record<string, unknown>) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => payload,
    } as Response as Awaited<ReturnType<typeof expoFetch>>);
  }

  const pair = () =>
    pairDesktop(['http://192.168.1.2'], { code: 'code' } as never, new AbortController().signal);

  it.each([['not-a-uuid'], [''], [42], [null]])(
    'pairs anyway when the desktop reports %p as its analytics identity',
    async (clientId) => {
      respondWith({ clientId, name: 'Desktop', token: 'token', version: '2.0.8' });

      await expect(pair()).resolves.toMatchObject({ name: 'Desktop', token: 'token' });
    },
  );

  it('carries a usable identity through', async () => {
    const clientId = '99999999-8888-4777-8666-555555555555';
    respondWith({ clientId, name: 'Desktop', token: 'token', version: '2.0.8' });

    await expect(pair()).resolves.toMatchObject({ clientId });
  });
});
