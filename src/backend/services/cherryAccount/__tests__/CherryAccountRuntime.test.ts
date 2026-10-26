import { CherryAccountRuntime } from '../CherryAccountRuntime';

const mockStorage = new Map<string, string>();
let mockState: any = { _tag: 'signedOut' };
let mockOptions: any;
const mockComplete = jest.fn(async () => {
  mockState = {
    _tag: 'signedIn',
    subject: 'person-a',
    name: 'Account Name',
    profile: { product: 'enterprise', profileId: 'org-a' },
  };
  return mockState;
});
const mockProduct = jest.fn(async () => 'product-token');
const mockBegin = jest.fn(async () => ({
  url: 'https://accounts.example/login',
  redirectUri: 'cherrystudio://auth/cherry-callback',
}));
const mockSignOut = jest.fn(async () => {
  mockState = { _tag: 'signedOut' };
});
jest.mock('@cherryinternal/accounts-portal/client', () => ({
  createAccountsPortal: (options: unknown) => {
    mockOptions = options;
    return {
      ready: Promise.resolve(),
      getState: () => mockState,
      beginSignIn: mockBegin,
      completeSignIn: mockComplete,
      getProductToken: mockProduct,
      signOut: mockSignOut,
    };
  },
}));
jest.mock('../cherryAccountConfig', () => ({
  cherryAccountConfig: () => ({
    issuer: 'https://id.example',
    portal: 'https://accounts.example',
    cloud: 'https://cloud.example',
    enterprise: 'https://enterprise.example',
    clientId: 'native',
    redirectUri: 'cherrystudio://auth/cherry-callback',
    scopes: [],
  }),
}));
jest.mock('../cherryDevice', () => ({
  readCherryDevice: async () => ({
    privateKey: 'never-send',
    publicKey: 'public-key',
    machineCode: 'machine',
  }),
  signCherryRequest: () => ({ 'Cherry-Signature': 'signed', 'Cherry-Device-ID': 'device-a' }),
}));
jest.mock('react-native-quick-crypto', () => ({ Buffer: jest.requireActual('buffer').Buffer }));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: async (key: string) => mockStorage.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockStorage.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    mockStorage.delete(key);
  },
}));

const reply = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;
let mockFetch: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  mockStorage.clear();
  mockState = { _tag: 'signedOut' };
  mockFetch = jest.fn().mockResolvedValue(reply({ displayName: 'Team Name' }));
  global.fetch = mockFetch;
});

it('finishes product entry and reads the member before returning a credential-free signed-in state', async () => {
  const runtime = new CherryAccountRuntime();
  const browser = jest.fn(async () => 'cherrystudio://auth/cherry-callback?code=one-use');
  const status = await runtime.signIn(browser);
  expect(status).toMatchObject({
    signedIn: true,
    destination: 'enterprise',
    profileId: 'org-a',
    displayName: 'Team Name',
  });
  expect(mockProduct).toHaveBeenCalledWith('https://enterprise.example');
  expect(mockFetch).toHaveBeenCalledWith(
    'https://enterprise.example/users/me',
    expect.objectContaining({
      headers: expect.objectContaining({ authorization: 'Bearer product-token' }),
    }),
  );
  expect(JSON.stringify(status)).not.toMatch(/token|never-send/);
  const restored = new CherryAccountRuntime();
  expect(await restored.getStatus()).toMatchObject({ signedIn: true, profileId: 'org-a' });
  expect(browser).toHaveBeenCalledTimes(1);
});

it('does not enter on browser cancellation and never reports a failed product entry as signed in', async () => {
  const runtime = new CherryAccountRuntime();
  await expect(runtime.signIn(async () => null)).rejects.toThrow('cancelled');
  expect(mockProduct).not.toHaveBeenCalled();
  mockFetch.mockResolvedValue(reply({}, false));
  await expect(runtime.signIn(async () => 'callback')).rejects.toThrow('entry_failed');
  expect(await runtime.getStatus()).toEqual({ configured: true, signedIn: false });
});

it('adapts the Cloud device contract without transmitting the private key', async () => {
  const runtime = new CherryAccountRuntime();
  await runtime.getStatus();
  mockFetch.mockResolvedValue(
    reply({
      token_set: { access_token: 'product', expires_in: 900 },
      account: { device: { id: 'device-a' }, account: { display_name: 'Name' } },
    }),
  );
  const response = await mockOptions.fetch('https://cloud.example/accounts-portal/v1/enter', {
    body: JSON.stringify({ profileId: 'account-a', idToken: 'id-token' }),
    headers: { authorization: 'Bearer identity-token' },
  });
  const body = JSON.parse(mockFetch.mock.calls[0][1].body);
  expect(body).toMatchObject({
    profile: 'account-a',
    id_token: 'id-token',
    device_public_key: 'public-key',
    machine_code: 'machine',
  });
  expect(body).not.toHaveProperty('privateKey');
  expect(await response.json()).toMatchObject({
    accessToken: 'product',
    tokenType: 'Bearer',
    expiresIn: 900,
  });
});

it('prevents a late browser callback from entering after cancellation', async () => {
  const runtime = new CherryAccountRuntime();
  const controller = new AbortController();
  await expect(
    runtime.signIn(async () => {
      controller.abort();
      return 'callback';
    }, controller.signal),
  ).rejects.toThrow('cancelled');
  expect(mockComplete).not.toHaveBeenCalled();
});

it('enters community through the published signed account endpoint', async () => {
  mockComplete.mockImplementationOnce(async () => {
    mockState = {
      _tag: 'signedIn',
      subject: 'person-a',
      name: 'Name',
      profile: { product: 'cloud', profileId: 'account-a' },
    };
    return mockState;
  });
  mockProduct.mockImplementationOnce(async () => {
    await mockOptions.fetch('https://cloud.example/accounts-portal/v1/enter', {
      body: JSON.stringify({ profileId: 'account-a', idToken: 'id-token' }),
    });
    return 'cloud-token';
  });
  mockFetch
    .mockResolvedValueOnce(
      reply({
        token_set: { access_token: 'cloud-token', expires_in: 900 },
        account: { device: { id: 'device-a' } },
      }),
    )
    .mockResolvedValueOnce(reply({ account: { display_name: 'Community Name' } }));
  const result = await new CherryAccountRuntime().signIn(async () => 'callback');
  expect(result).toMatchObject({
    signedIn: true,
    destination: 'cloud',
    displayName: 'Community Name',
  });
  expect(mockFetch).toHaveBeenLastCalledWith(
    'https://cloud.example/api/v1/account',
    expect.objectContaining({
      headers: expect.objectContaining({
        authorization: 'Bearer cloud-token',
        'Cherry-Device-ID': 'device-a',
        'Cherry-Signature': 'signed',
      }),
    }),
  );
});
