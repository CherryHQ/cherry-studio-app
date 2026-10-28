const mockCreatePortal = jest.fn();
const mockCreateBridge = jest.fn();
let mockScheme: string | undefined;

jest.mock('@cherryinternal/accounts-portal/client', () => ({
  createAccountsPortal: (options: unknown) => mockCreatePortal(options),
}));
jest.mock('@logger', () => ({ loggerService: { withContext: () => ({ error: jest.fn() }) } }));
jest.mock('expo', () => ({ reloadAppAsync: jest.fn() }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return {
        scheme: mockScheme,
        extra: {
          accountsPortal: {
            issuer: 'https://auth.example.com',
            origin: 'https://accounts.example.com',
            clientId: 'mobile',
            scopes: ['openid'],
            enterpriseAddress: 'https://enterprise.example.com',
          },
        },
      };
    },
  },
}));
jest.mock('expo-crypto', () => ({}));
jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-web-browser', () => ({}));
jest.mock('react-native-mmkv', () => ({ createMMKV: () => ({}) }));
jest.mock('@/backend/services/enterprise', () => ({ AccountRuntime: jest.fn() }));
jest.mock('@/backend/services/http', () => ({
  createFetchBridge: (options: unknown) => mockCreateBridge(options),
}));
jest.mock('../installationProfiles', () => ({ installationProfiles: () => ({}) }));

function compose(scheme?: string) {
  mockScheme = scheme;
  mockCreatePortal.mockReset().mockReturnValue({ ready: Promise.resolve() });
  mockCreateBridge.mockClear();
  jest.isolateModules(() => {
    const { installationAccount } =
      jest.requireActual<typeof import('../installationAccount')>('../installationAccount');
    installationAccount();
  });
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

test('allows userinfo only on the configured identity issuer', () => {
  compose('cherrystudio-dev');
  const { assertUrl } = mockCreateBridge.mock.calls[0]![0];
  expect(assertUrl('https://auth.example.com/oidc/v1/userinfo').origin).toBe(
    'https://auth.example.com',
  );
  expect(() => assertUrl('https://other.example.com/oidc/v1/userinfo')).toThrow();
  expect(() => assertUrl('https://auth.example.com/oidc/v1/userinfo?redirect=other')).toThrow();
});
