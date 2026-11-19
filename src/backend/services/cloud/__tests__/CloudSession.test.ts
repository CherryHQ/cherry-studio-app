import { CloudSession, type CloudIdentity } from '../CloudSession';
import { cloudSnapshot } from './_cloudFixtures';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({ request: mockRequest }),
  isHttpError: (error: unknown) => error instanceof Error && error.name === 'HttpError',
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
    getIdentity: jest.fn(
      (): CloudIdentity => ({
        key: 'a',
        profileId: 'account-a',
        apiOrigin: 'https://cloud.example',
      }),
    ),
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
  await Promise.all([
    session.get('/api/v1/account'),
    session.get('/v1/models?limit=1000&catalog=full'),
  ]);
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
  await session.headers('GET', '/v1/models?limit=1000&catalog=full');
  mockRequest.mockResolvedValueOnce({
    data: { token_set: { ...entry().data.token_set, access_token: 'rotated-access' } },
  });
  expect(await session.headers('GET', '/v1/models?limit=1000&catalog=full')).toMatchObject({
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

test('signs the AMD entry POST with zero body bytes and the Product Session', async () => {
  const { session } = setup();
  mockRequest.mockResolvedValueOnce(entry()).mockResolvedValueOnce({ data: {} });
  const path = '/api/v1/amd/desktop/entry';
  await session.postEmpty(path);
  const request = mockRequest.mock.calls[1][0];
  expect(request).toMatchObject({
    method: 'POST',
    path,
    redirect: 'error',
    credentials: 'omit',
    headers: { authorization: 'Bearer cloud-access', signatureInput: `POST\n${path}\n` },
  });
  expect(request).not.toHaveProperty('body');
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
  const pending = session.headers('GET', '/v1/models?limit=1000&catalog=full');
  await Promise.resolve();
  source.getIdentity.mockReturnValue({ ...source.getIdentity(), key: 'b', profileId: 'account-b' });
  resolve(entry());
  await expect(pending).rejects.toMatchObject({ code: 'cloud_signed_out' });
});

test.each([{ apiOrigin: 'https://replacement.example' }])(
  'a service address change invalidates a session even when the source identity key is unchanged: %j',
  async (service) => {
    const { session, source } = setup();
    source.getIdentity.mockReturnValue({ ...source.getIdentity(), ...service });
    await expect(session.get('/v1/models?limit=1000&catalog=full')).rejects.toMatchObject({
      code: 'cloud_signed_out',
    });
    expect(mockRequest).not.toHaveBeenCalled();
  },
);

test.each(['SESSION_EXPIRED', 'REAUTH_REQUIRED', 'REQUEST_REPLAYED'])(
  'recovers %s once and signs the same catalog target again',
  async (code) => {
    const { session } = setup();
    const path = '/v1/models?limit=1000&catalog=full';
    const failure = Object.assign(new Error(code), {
      name: 'HttpError',
      status: code === 'REQUEST_REPLAYED' ? 409 : 401,
      code,
    });
    mockRequest.mockResolvedValueOnce(entry()).mockRejectedValueOnce(failure);
    if (code !== 'REQUEST_REPLAYED') mockRequest.mockResolvedValueOnce(entry());
    mockRequest.mockResolvedValueOnce({ data: { data: [] } });
    await expect(session.get(path)).resolves.toEqual({ data: [] });
    const calls = mockRequest.mock.calls.map(([request]) => request);
    expect(calls.filter((request) => request.path === path)).toHaveLength(2);
    if (code === 'SESSION_EXPIRED') expect(calls[2].path).toBe('/api/v1/product-sessions/refresh');
    if (code === 'REAUTH_REQUIRED') expect(calls[2].path).toBe('/accounts-portal/v1/enter');
  },
);
