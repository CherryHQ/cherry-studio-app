import { CloudSession } from '../CloudSession';
import { cloudSnapshot } from './cloudFixtures';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({ request: mockRequest }),
  isHttpError: () => false,
}));
jest.mock('@/backend/utils/defaultAppHeaders', () => ({ defaultAppHeaders: () => ({}) }));
jest.mock('../cloudDevice', () => ({
  cloudSignatureHeaders: (
    _device: unknown,
    id: string,
    method: string,
    path: string,
    body: string,
  ) => ({ 'Cherry-Device-ID': id, signatureInput: [method, path, body].join('\n') }),
}));

function setup() {
  const source = {
    getIdentity: jest.fn(() => ({ key: 'a', profileId: 'account-a' })),
    getTokens: jest.fn(async () => ({ accessToken: 'idp-access', idToken: 'idp-id' })),
    subscribe: () => () => {},
  };
  const controller = new AbortController();
  const session = new CloudSession(
    'https://cloud.example',
    source.getIdentity(),
    source,
    { publicKey: 'public', machineCode: 'machine', platform: 'ios', sign: () => 'signature' },
    '0.5.1',
    controller.signal,
  );
  return { session, source, controller };
}
const entry = (expiresIn = 3600) => ({
  data: {
    token_set: {
      access_token: 'cloud-access',
      refresh_token: 'cloud-refresh',
      session_id: 'session-id',
      expires_in: expiresIn,
    },
    account: cloudSnapshot().account,
  },
});
beforeEach(() => mockRequest.mockReset());

test('concurrent reads share device-bound product entry and never send IdP credentials to model routes', async () => {
  const { session } = setup();
  mockRequest.mockImplementation(async ({ path }) =>
    path === '/accounts-portal/v1/enter' ? entry() : { data: {} },
  );
  await Promise.all([session.get('/api/v1/account'), session.get('/v1/models')]);
  const requests = mockRequest.mock.calls.map(([request]) => request);
  expect(requests.filter((request) => request.path === '/accounts-portal/v1/enter')).toEqual([
    expect.objectContaining({
      redirect: 'error',
      headers: expect.objectContaining({ authorization: 'Bearer idp-access' }),
      body: expect.objectContaining({
        id_token: 'idp-id',
        profile: 'account-a',
        device_public_key: 'public',
        machine_code: 'machine',
        platform: 'ios',
        client_version: '0.5.1',
      }),
    }),
  ]);
  expect(requests.filter((request) => request.method === 'GET')).toEqual([
    expect.objectContaining({
      headers: expect.objectContaining({
        authorization: 'Bearer cloud-access',
        'Cherry-Device-ID': 'device-id',
      }),
    }),
    expect.objectContaining({
      headers: expect.objectContaining({
        authorization: 'Bearer cloud-access',
        'Cherry-Device-ID': 'device-id',
      }),
    }),
  ]);
});

test('rotation signs exact refresh JSON without a bearer header', async () => {
  const { session } = setup();
  mockRequest.mockResolvedValueOnce(entry(1));
  await session.headers('GET', '/v1/models');
  mockRequest.mockResolvedValueOnce({
    data: { token_set: { ...entry().data.token_set, access_token: 'rotated-access' } },
  });
  expect(await session.headers('GET', '/v1/models')).toMatchObject({
    authorization: 'Bearer rotated-access',
  });
  const request = mockRequest.mock.calls[1][0];
  expect(request.path).toBe('/api/v1/product-sessions/refresh');
  expect(request.headers).not.toHaveProperty('authorization');
  expect(request.headers.signatureInput).toBe(`POST\n${request.path}\n${request.body}`);
  expect(JSON.parse(request.body)).toEqual({
    session_id: 'session-id',
    refresh_token: 'cloud-refresh',
  });
});

test('a late product-entry response cannot reopen an account after replacement', async () => {
  const { session, source } = setup();
  let resolve!: (value: ReturnType<typeof entry>) => void;
  mockRequest.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = session.headers('GET', '/v1/models');
  await Promise.resolve();
  source.getIdentity.mockReturnValue({ key: 'b', profileId: 'account-b' });
  resolve(entry());
  await expect(pending).rejects.toMatchObject({ code: 'cloud_signed_out' });
});
