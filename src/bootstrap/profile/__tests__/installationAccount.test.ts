import type { AuthState } from '@cherryinternal/accounts-portal/client';

import type { AccountSessionContext } from '@/shared/contracts/account';

const mockCreatePortal = jest.fn();
const mockCreateRuntime = jest.fn();
const mockCreateBridge = jest.fn();
const mockConfigurationError = jest.fn();
let mockScheme: string | undefined;
let mockConfiguration: Record<string, unknown>;

jest.mock('@cherryinternal/accounts-portal/client', () => ({
  createAccountsPortal: (options: unknown) => mockCreatePortal(options),
}));
jest.mock('@logger', () => ({
  loggerService: { withContext: () => ({ error: mockConfigurationError }) },
}));
jest.mock('expo', () => ({ reloadAppAsync: jest.fn() }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return {
        scheme: mockScheme,
        extra: {
          accountsPortal: mockConfiguration,
        },
      };
    },
  },
}));
jest.mock('expo-crypto', () => ({}));
jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-web-browser', () => ({}));
jest.mock('react-native-mmkv', () => ({ createMMKV: () => ({}) }));
jest.mock('@/backend/services/enterprise', () => ({
  AccountRuntime: jest.fn((options: unknown) => mockCreateRuntime(options)),
}));
jest.mock('@/backend/services/http', () => ({
  createFetchBridge: (options: unknown) => mockCreateBridge(options),
}));
jest.mock('../installationProfiles', () => ({ installationProfiles: () => ({}) }));
jest.mock('../../runtime/diagnosticContext', () => ({ setDiagnosticAccountReader: jest.fn() }));

const configuration = {
  issuer: 'https://auth.example.com',
  origin: 'https://accounts.example.com',
  clientId: 'mobile',
  scopes: ['openid'],
  enterpriseAddresses: {
    cn: 'https://enterprise.example.com',
    global: 'https://enterprise.global.example.com',
  },
};

function compose(scheme?: string, values: Record<string, unknown> = configuration) {
  mockScheme = scheme;
  mockConfiguration = values;
  mockCreatePortal.mockReset().mockReturnValue({ ready: Promise.resolve() });
  mockCreateRuntime.mockClear();
  mockCreateBridge.mockClear();
  mockConfigurationError.mockClear();
  jest.isolateModules(() => {
    const { installationAccount } =
      jest.requireActual<typeof import('../installationAccount')>('../installationAccount');
    installationAccount();
  });
  return mockCreateRuntime.mock.calls[0]![0] as {
    resolveSessionContext(session: AuthState): AccountSessionContext | null;
  };
}

test.each(['cherrystudio', 'cherrystudio-dev', 'cherrystudio-preview'])(
  'registers the callback on the installed %s scheme',
  (scheme) => {
    compose(scheme);
    expect(mockCreatePortal).toHaveBeenCalledWith(
      expect.objectContaining({ redirectUri: `${scheme}://auth/callback` }),
    );
  },
);

test.each([undefined, 'exp'])(
  'does not offer cloud sign-in without a supported native callback (%s)',
  (scheme) => {
    compose(scheme);
    expect(mockCreatePortal).not.toHaveBeenCalled();
  },
);

test('does not require enterprise configuration to compose ordinary account sign-in', () => {
  const { enterpriseAddresses: _enterpriseAddresses, ...cloudConfiguration } = configuration;
  compose('cherrystudio', cloudConfiguration);
  expect(mockCreatePortal).toHaveBeenCalled();
  expect(mockConfigurationError).not.toHaveBeenCalled();
});

test('reports invalid configuration fields instead of silently disabling sign-in', () => {
  compose('cherrystudio', { ...configuration, clientId: '' });
  expect(mockCreatePortal).not.toHaveBeenCalled();
  expect(mockConfigurationError).toHaveBeenCalledWith('Cloud sign-in configuration is invalid', {
    fields: ['clientId'],
    operation: 'account.configuration',
  });
});

test('allows userinfo only on the configured identity issuer', () => {
  compose('cherrystudio-dev');
  const { assertUrl } = mockCreateBridge.mock.calls[0]![0];
  expect(assertUrl('https://auth.example.com/oidc/v1/userinfo').origin).toBe(
    'https://auth.example.com',
  );
  expect(() => assertUrl('https://other.example.com/oidc/v1/userinfo')).toThrow();
  expect(() => assertUrl('https://auth.example.com/oidc/v1/userinfo?redirect=other')).toThrow();
});

test.each(['cloud', 'enterprise'] as const)(
  'maps a current %s SDK session without region metadata to the configured China identity',
  (product) => {
    const issuer = 'https://auth.cherryai.com.cn';
    const { resolveSessionContext } = compose('cherrystudio', { ...configuration, issuer });
    expect(
      resolveSessionContext({
        _tag: 'signedIn',
        subject: 'user-1',
        profile: { product, profileId: 'profile-1' },
      }),
    ).toEqual({ environment: 'cn', issuer });
  },
);

test('does not create an account context for a signed-out SDK session', () => {
  const { resolveSessionContext } = compose('cherrystudio');
  expect(resolveSessionContext({ _tag: 'signedOut' })).toBeNull();
});

test('does not create an account context without a valid configured issuer', () => {
  const { resolveSessionContext } = compose('cherrystudio', { ...configuration, issuer: '' });
  expect(
    resolveSessionContext({
      _tag: 'signedIn',
      subject: 'user-1',
      profile: { product: 'cloud', profileId: 'profile-1' },
    }),
  ).toBeNull();
});
