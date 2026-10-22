import type { AuthState } from '@cherryinternal/accounts-portal/client';

import { type ActiveProfile, LOCAL_PROFILE } from '@/shared/data/activeProfile';

import { AccountRuntime } from '../AccountRuntime';

jest.mock('@logger', () => ({
  loggerService: { withContext: () => ({ warn: jest.fn() }) },
}));

const enterpriseProfile: ActiveProfile = {
  id: '8a1f4e9c-2b7d-4c1a-9e3f-1d2c3b4a5f60',
  identity: {
    deployment: 'server-1',
    issuer: 'https://auth',
    subject: 'user-1',
    productProfileId: 'org-1',
  },
  address: 'https://cse.example.com',
};

function setup(session: AuthState, active: ActiveProfile = LOCAL_PROFILE) {
  const portal = {
    ready: Promise.resolve(),
    getState: jest.fn(() => session),
    subscribe: jest.fn(),
    beginSignIn: jest.fn(async () => ({ url: 'https://portal/sign-in', redirectUri: 'cb://' })),
    completeSignIn: jest.fn(async () => session),
    getProductToken: jest.fn(async () => 'product-token'),
    signOut: jest.fn(async () => ({ revoked: true, loggedOut: true })),
  };
  const options = {
    portal,
    issuer: 'https://auth',
    defaultAddress: 'https://cse.example.com',
    active,
    profiles: { resolve: jest.fn(() => enterpriseProfile), setActive: jest.fn() },
    prompt: { read: () => false, write: jest.fn() },
    createApi: jest.fn(() => ({
      getConfiguration: jest.fn(async () => ({ serverUniqueId: 'server-1' })),
      setupAgent: jest.fn(),
      downloadLibraryItem: jest.fn(),
    })),
    openBrowser: jest.fn(async (): Promise<string | null> => 'cb://?code=1'),
    reload: jest.fn(async () => {}),
  };
  return { runtime: new AccountRuntime(options), options };
}

const signedIn = (product: 'cloud' | 'enterprise'): AuthState => ({
  _tag: 'signedIn',
  subject: 'user-1',
  name: 'Ada',
  profile: { product, profileId: product === 'enterprise' ? 'org-1' : 'me' },
});

describe('AccountRuntime', () => {
  it('keeps local data for a community account without reloading', async () => {
    const { runtime, options } = setup(signedIn('cloud'));
    await expect(runtime.signIn()).resolves.toBe(true);
    expect(options.reload).not.toHaveBeenCalled();
    expect(runtime.getState().hasPrompted).toBe(true);
  });

  it('opens the enterprise profile reached at the entered private address', async () => {
    const { runtime, options } = setup(signedIn('enterprise'));
    await expect(runtime.signIn({ address: 'ai.corp.example/api' })).resolves.toBe(false);
    expect(options.profiles.resolve).toHaveBeenCalledWith(
      {
        deployment: 'server-1',
        issuer: 'https://auth',
        subject: 'user-1',
        productProfileId: 'org-1',
      },
      'https://ai.corp.example/api',
    );
    expect(options.profiles.setActive).toHaveBeenCalledWith(enterpriseProfile);
    expect(options.reload).toHaveBeenCalled();
  });

  it('returns an enterprise profile to local data when a community account signs in', async () => {
    const { runtime, options } = setup(signedIn('cloud'), enterpriseProfile);
    await runtime.signIn();
    expect(options.profiles.setActive).toHaveBeenCalledWith(LOCAL_PROFILE);
    expect(options.reload).toHaveBeenCalled();
  });

  it('changes nothing when the browser is dismissed', async () => {
    const { runtime, options } = setup(signedIn('cloud'));
    options.openBrowser.mockResolvedValueOnce(null);
    await expect(runtime.signIn()).resolves.toBe(false);
    expect(runtime.getState().hasPrompted).toBe(false);
  });

  it('asks an enterprise profile to sign in again when the restored session is gone', async () => {
    const { runtime } = setup({ _tag: 'signedOut' }, enterpriseProfile);
    await runtime.verify();
    expect(runtime.getState().needsSignIn).toBe(true);
  });
});
