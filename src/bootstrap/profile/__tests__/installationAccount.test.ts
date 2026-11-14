import type { AccountsPortalOptions } from '@cherryinternal/accounts-portal/client';

import type { AccountRuntimeOptions } from '@/backend/services/enterprise';

import { resolveCloudLogin } from '../cloudLoginConfig';

const mockCreatePortal = jest.fn();
const mockCreateRuntime = jest.fn();
const mockBridge = jest.fn();
const mockRequest = jest.fn();
const mockStore = new Map<string, string>();
const mockError = jest.fn();
let mockScheme: string | undefined;
let mockOrigin: unknown;
let mockActive: { identity: null | { issuer: string } } = { identity: null };

jest.mock('@cherryinternal/accounts-portal/client', () => ({
  createAccountsPortal: (options: unknown) => mockCreatePortal(options),
}));
jest.mock('@logger', () => ({ loggerService: { withContext: () => ({ error: mockError }) } }));
jest.mock('expo', () => ({ reloadAppAsync: jest.fn() }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { scheme: mockScheme, extra: { configServiceOrigin: mockOrigin } };
    },
  },
}));
jest.mock('expo-crypto', () => ({}));
jest.mock('expo-secure-store', () => ({
  getItem: (key: string) => mockStore.get(key) ?? null,
  setItem: (key: string, value: string) => mockStore.set(key, value),
  setItemAsync: async (key: string, value: string) => {
    mockStore.set(key, value);
  },
  getItemAsync: async (key: string) => mockStore.get(key) ?? null,
}));
jest.mock('expo-web-browser', () => ({}));
jest.mock('react-native-mmkv', () => ({ createMMKV: () => ({}) }));
jest.mock('@/backend/services/enterprise', () => ({
  AccountRuntime: jest.fn((options: unknown) => mockCreateRuntime(options)),
}));
jest.mock('@/backend/services/http', () => ({
  createFetchBridge: (options: unknown) => mockBridge(options),
  createHttpClient: () => ({ request: mockRequest }),
  isHttpError: (error: unknown) => error instanceof Error && error.name === 'HttpError',
}));
jest.mock('@/shared/data/activeProfile', () => ({ getActiveProfile: () => mockActive }));
jest.mock('../installationProfiles', () => ({ installationProfiles: () => ({}) }));
jest.mock('../../runtime/diagnosticContext', () => ({ setDiagnosticAccountReader: jest.fn() }));

function result(region = 'CN') {
  const sub = region.toLowerCase();
  return {
    schema_version: 1,
    requires_region_selection: false,
    region,
    oidc_client_id: sub + '-mobile',
    scopes: ['openid', 'profile', 'offline_access', 'audience:mobile'],
    redirect_uri: `${mockScheme}://auth/callback`,
    endpoints: {
      portal_url: `https://portal.${sub}.test`,
      issuer: `https://auth.${sub}.test`,
      api_base_url: `https://api.${sub}.test/v2`,
      web_url: `https://admin.${sub}.test`,
    },
  };
}

function launch() {
  jest.isolateModules(() => {
    const { installationAccount } =
      jest.requireActual<typeof import('../installationAccount')>('../installationAccount');
    installationAccount();
  });
  return mockCreateRuntime.mock.lastCall![0] as AccountRuntimeOptions;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  mockScheme = 'cherrystudio-preview';
  mockOrigin = 'https://config.test';
  mockActive = { identity: null };
  mockCreatePortal.mockImplementation((opts) => ({ ready: Promise.resolve(), ...opts }));
  mockRequest.mockReset().mockImplementation(async () => ({ status: 200, data: result() }));
});

test.each(['cherrystudio', 'cherrystudio-dev', 'cherrystudio-preview'])(
  'starts the installed %s app with its discovered registration',
  async (scheme) => {
    mockScheme = scheme;
    const runtime = launch();
    expect(mockRequest).not.toHaveBeenCalled();
    await runtime.preparePortal();
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/v1/resolve',
        credentials: 'omit',
        body: { client: 'mobile', platform: expect.stringMatching(/^(ios|android)$/) },
      }),
    );
    expect(mockCreatePortal).toHaveBeenCalledWith(
      expect.objectContaining({
        issuer: 'https://auth.cn.test',
        clientId: 'cn-mobile',
        scopes: ['audience:mobile'],
        redirectUri: `${scheme}://auth/callback`,
      }),
    );
  },
);

test.each([undefined, 'exp'])('refuses an unsupported native callback (%s)', async (scheme) => {
  mockScheme = scheme;
  await expect(launch().preparePortal()).rejects.toMatchObject({ code: 'unavailable' });
  expect(mockRequest).not.toHaveBeenCalled();
});

test.each([
  undefined,
  'not a URL',
  'http://config.test',
  'https://user@config.test',
  'https://config.test/?secret=value',
])('refuses an invalid config origin', async (origin) => {
  mockOrigin = origin;
  await expect(launch().preparePortal()).rejects.toMatchObject({ code: 'unavailable' });
  expect(mockRequest).not.toHaveBeenCalled();
});

test('a mismatched callback cannot replace the pending registration', async () => {
  const first = launch();
  await first.preparePortal();
  mockRequest.mockResolvedValue({
    status: 200,
    data: { ...result('GLOBAL'), redirect_uri: 'cherrystudio://auth/callback' },
  });
  await expect(first.preparePortal()).rejects.toMatchObject({ code: 'response' });
  const restored = launch();
  expect(restored.portal).toMatchObject({ issuer: 'https://auth.cn.test' });
  expect(mockRequest).toHaveBeenCalledTimes(2);
});

test('cold launch restores the pending issuer offline and subsequent logins isolate credentials', async () => {
  await launch().preparePortal();
  const cn = mockCreatePortal.mock.lastCall![0] as AccountsPortalOptions;
  await cn.storage.set('pending', 'cn-verifier');
  await cn.storage.set('refresh', 'cn-refresh');
  const restored = launch();
  expect(restored.portal).toMatchObject({ issuer: 'https://auth.cn.test' });
  expect(mockRequest).toHaveBeenCalledTimes(1);
  const afterRestart = mockCreatePortal.mock.lastCall![0] as AccountsPortalOptions;
  expect(await afterRestart.storage.get('pending')).toBe('cn-verifier');
  mockRequest.mockResolvedValue({ status: 200, data: result('GLOBAL') });
  await restored.preparePortal();
  const global = mockCreatePortal.mock.lastCall![0] as AccountsPortalOptions;
  expect(await global.storage.get('pending')).toBeNull();
  expect(await global.storage.get('refresh')).toBeNull();
  const validate = mockBridge.mock.lastCall![0].assertUrl;
  expect(validate('https://api.global.test/v2/accounts-portal/v1/enter').origin).toBe(
    'https://api.global.test',
  );
  expect(() => validate('https://api.cn.test/v2/accounts-portal/v1/enter')).toThrow();
  expect(() => validate('https://auth.cn.test/oidc/v1/userinfo')).toThrow();
});

test('the enterprise web URL never becomes the community billing URL', async () => {
  const runtime = launch();
  await runtime.preparePortal();
  const signedIn = {
    _tag: 'signedIn',
    subject: '1',
    name: undefined,
    profile: { product: 'cloud', profileId: '1' },
  } as const;
  expect(runtime.resolveSessionContext(signedIn)).toEqual({
    issuer: 'https://auth.cn.test',
    enterpriseApiBaseUrl: 'https://api.cn.test/v2',
    cloudApiOrigin: undefined,
    cloudWebUrl: undefined,
  });
  expect(runtime.resolveSessionContext({ _tag: 'signedOut' })).toBeNull();
  const data = result('GLOBAL');
  mockRequest.mockResolvedValue({
    status: 200,
    data: {
      ...data,
      endpoints: {
        issuer: data.endpoints.issuer,
        portal_url: data.endpoints.portal_url,
        cloud_api_origin: 'https://cloud.global.test',
        cloud_web_url: 'https://billing.global.test/account',
      },
    },
  });
  await runtime.preparePortal();
  const validate = mockBridge.mock.lastCall![0].assertUrl;
  expect(() => validate('https://api.global.test/v2/accounts-portal/v1/enter')).toThrow();
  expect(runtime.resolveSessionContext(signedIn)).toEqual({
    issuer: data.endpoints.issuer,
    enterpriseApiBaseUrl: undefined,
    cloudApiOrigin: 'https://cloud.global.test',
    cloudWebUrl: 'https://billing.global.test/account',
  });
});

test('an older enterprise profile reauthenticates only against its own issuer', async () => {
  mockActive = { identity: { issuer: 'https://auth.global.test' } };
  mockRequest.mockImplementation(async ({ body }) => ({
    status: 200,
    data: result(body.selected_region),
  }));
  await launch().preparePortal();
  expect(mockCreatePortal.mock.lastCall![0].issuer).toBe('https://auth.global.test');
  expect(mockRequest.mock.calls.map(([r]) => r.body.selected_region)).toEqual(['CN', 'GLOBAL']);
});

test('a failed resolve never creates a default portal', async () => {
  mockRequest.mockRejectedValue(
    Object.assign(new Error('unavailable'), { name: 'HttpError', status: 503 }),
  );
  await expect(launch().preparePortal()).rejects.toMatchObject({ code: 'unavailable' });
  expect(mockCreatePortal).not.toHaveBeenCalled();
});

test.each(['ios', 'android'])('sends the %s mobile platform to discovery', async (platform) => {
  await resolveCloudLogin('https://config.test', platform, result().redirect_uri);
  expect(mockRequest).toHaveBeenCalledWith(
    expect.objectContaining({ body: { client: 'mobile', platform } }),
  );
});

test('an active enterprise profile cannot restore another issuer registration', async () => {
  await launch().preparePortal();
  mockActive = { identity: { issuer: 'https://auth.global.test' } };
  expect(launch().portal).toBeNull();
});

test('requires the scopes that the installed SDK requests by default', async () => {
  mockRequest.mockResolvedValue({ status: 200, data: { ...result(), scopes: ['openid'] } });
  await expect(launch().preparePortal()).rejects.toMatchObject({ code: 'response' });
  expect(mockCreatePortal).not.toHaveBeenCalled();
});
