import {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

import { AccountError } from '@/shared/contracts/account';

import { createEnterpriseApi, type EnterpriseSession } from '../enterpriseApi';

const mockAdapter = jest.fn<Promise<AxiosResponse>, [InternalAxiosRequestConfig]>();

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('@logger', () => {
  const logger = { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() };
  return { loggerService: { withContext: () => logger } };
});
// The real client and interceptor dispatch run over a scripted Axios adapter.
jest.mock('@/backend/services/http', () => ({
  ...jest.requireActual('@/backend/services/http'),
  createHttpClient: jest
    .requireActual('@/backend/services/http/createHttpClient')
    .__testing.createHttpClientFactoryWithAdapter((config: InternalAxiosRequestConfig) =>
      mockAdapter(config),
    ),
}));

const respond = (config: InternalAxiosRequestConfig, status: number): AxiosResponse => ({
  config,
  data: { serverUniqueId: 'server' },
  headers: new AxiosHeaders(),
  status,
  statusText: String(status),
});

function answer(...statuses: number[]) {
  for (const status of statuses) {
    mockAdapter.mockImplementationOnce(async (config) => {
      if (status < 400) return respond(config, status);
      throw new AxiosError('failed', AxiosError.ERR_BAD_REQUEST, config, undefined, {
        ...respond(config, status),
        data: {},
      });
    });
  }
}

const sentTokens = () =>
  mockAdapter.mock.calls.map(([config]) => AxiosHeaders.from(config.headers).get('Authorization'));

function privateSession() {
  let token = 'old-token';
  const session = {
    getProductToken: jest.fn(async () => token),
    refuseProductToken: jest.fn(async () => {
      token = 'new-token';
    }),
    reportRejected: jest.fn(),
  } satisfies Required<EnterpriseSession>;
  return session;
}

const api = (session: EnterpriseSession) =>
  createEnterpriseApi({ baseUrl: 'https://enterprise.example.com/api', session });

beforeEach(() => mockAdapter.mockReset());

describe('enterprise API session handling', () => {
  it('replays a 401 once with the private token the interceptor rotated', async () => {
    const session = privateSession();
    answer(401, 200);
    await expect(api(session).getConfiguration()).resolves.toEqual({ serverUniqueId: 'server' });
    expect(session.refuseProductToken).toHaveBeenCalledWith('old-token');
    expect(sentTokens()).toEqual(['Bearer old-token', 'Bearer new-token']);
    expect(session.reportRejected).not.toHaveBeenCalled();
  });

  it.each([
    ['an Agent setup', (session: EnterpriseSession) => api(session).setupAgent(1)],
    ['a Skill package', (session: EnterpriseSession) => api(session).downloadLibraryItem(7, 1024)],
  ])('leaves the session alone when the role may not read %s', async (_, read) => {
    const session = privateSession();
    answer(403);
    await expect(read(session)).rejects.toMatchObject({ status: 403 });
    expect(session.refuseProductToken).not.toHaveBeenCalled();
    expect(session.reportRejected).not.toHaveBeenCalled();
    expect(mockAdapter).toHaveBeenCalledTimes(1);
  });

  it('refuses the session when the organization configuration is forbidden', async () => {
    const session = privateSession();
    answer(403);
    await expect(api(session).getConfiguration()).rejects.toMatchObject({ status: 403 });
    expect(session.reportRejected).toHaveBeenCalledTimes(1);
  });

  it('fails a refused cloud session while reading its token, before a replay is sent', async () => {
    let refused = false;
    const session: EnterpriseSession = {
      getProductToken: async () => {
        if (refused) throw new AccountError('rejected');
        return 'product-token';
      },
      refuseProductToken: async () => {
        refused = true;
      },
    };
    answer(401);
    await expect(api(session).getUser()).rejects.toMatchObject({ code: 'rejected' });
    expect(mockAdapter).toHaveBeenCalledTimes(1);
  });

  it('neither refuses nor replays for a sign-in exchange', async () => {
    answer(401);
    await expect(
      api({ getProductToken: async () => 'sign-in-token' }).getConfiguration(),
    ).rejects.toMatchObject({ status: 401 });
    expect(mockAdapter).toHaveBeenCalledTimes(1);
  });
});
