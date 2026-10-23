import type { AuthState } from '@cherryinternal/accounts-portal/client';

import { HttpError } from '@/backend/services/http';
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

const privateProfile: ActiveProfile = {
  id: '9b2e5f0d-3c8e-4d2b-8f4a-2e3d4c5b6a71',
  identity: { authentication: 'password', deployment: 'server-1', subject: 'user-1' },
  address: 'https://private.example.com/api',
};
const privateCredentials = {
  accessToken: 'private-token',
  refreshToken: 'refresh-1',
  serverUniqueId: 'server-1',
  user: { id: 'user-1', username: 'Ada' },
};

function setup(
  session: AuthState,
  active: ActiveProfile = LOCAL_PROFILE,
  ready = Promise.resolve(),
) {
  const portal = {
    ready,
    getState: jest.fn(() => session),
    subscribe: jest.fn((_listener: (state: AuthState) => void) => () => {}),
    beginSignIn: jest.fn(async () => ({ url: 'https://portal/sign-in', redirectUri: 'cb://' })),
    completeSignIn: jest.fn(async () => session),
    getProductToken: jest.fn(async () => 'product-token'),
    listProfiles: jest.fn(async () => ({
      profiles: [
        {
          product: 'enterprise' as const,
          id: 'org-1',
          kind: 'organization' as const,
          displayName: 'Acme',
        },
      ],
      unavailable: [],
    })),
    signOut: jest.fn(async () => ({ revoked: true, loggedOut: true })),
  };
  const options = {
    portal,
    issuer: 'https://auth',
    defaultAddress: 'https://cse.example.com',
    active,
    profiles: { resolve: jest.fn(() => enterpriseProfile), setActive: jest.fn() },
    prompt: { read: () => false, write: jest.fn() },
    browserSession: (() => {
      let stale = false;
      return {
        isStale: jest.fn(() => stale),
        setStale: jest.fn((value: boolean) => (stale = value)),
      };
    })(),
    createApi: jest.fn(() => ({
      getUser: jest.fn(async () => privateCredentials.user),
      getConfiguration: jest.fn(async () => ({ serverUniqueId: 'server-1' })),
      setupAgent: jest.fn(),
      downloadLibraryItem: jest.fn(),
    })),
    createPrivateApi: jest.fn(() => ({
      signIn: jest.fn(async () => privateCredentials),
      refresh: jest.fn(async () => ({
        ...privateCredentials,
        accessToken: 'rotated-token',
        refreshToken: 'refresh-2',
      })),
    })),
    credentials: {
      read: jest.fn(async (): Promise<string | null> => JSON.stringify(privateCredentials)),
      write: jest.fn(async (_id: string, _value: string) => {}),
      delete: jest.fn(async (_id: string) => {}),
    },
    openBrowser: jest.fn(async (): Promise<string | null> => 'cb://?code=1'),
    reload: jest.fn(async () => {}),
  };
  return {
    runtime: new AccountRuntime(options),
    options,
    publish(next: AuthState) {
      session = next;
      portal.subscribe.mock.calls.at(-1)![0](next);
    },
  };
}

const signedIn = (product: 'cloud' | 'enterprise'): Extract<AuthState, { _tag: 'signedIn' }> => ({
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

  it('shows community data as signed in only for a community session', async () => {
    const community = setup(signedIn('cloud'));
    await community.runtime.verify();
    expect(community.runtime.getState()).toMatchObject({ isSignedIn: true, name: 'Ada' });
    // An organization session whose enterprise sign-in did not finish is not a community login.
    const organization = setup(signedIn('enterprise'));
    await organization.runtime.verify();
    expect(organization.runtime.getState()).toMatchObject({
      isSignedIn: false,
      needsSignIn: false,
      name: undefined,
    });
  });

  it('opens the cloud enterprise profile using the configured cloud address', async () => {
    const { runtime, options } = setup(signedIn('enterprise'));
    await expect(runtime.signIn()).resolves.toBe(false);
    expect(options.profiles.resolve).toHaveBeenCalledWith(
      {
        deployment: 'server-1',
        issuer: 'https://auth',
        subject: 'user-1',
        productProfileId: 'org-1',
      },
      'https://cse.example.com',
      'Acme',
    );
    expect(options.profiles.setActive).toHaveBeenCalledWith(enterpriseProfile);
    expect(options.reload).toHaveBeenCalled();
  });

  it('asks the portal who signs in when the installation already holds a cloud session', async () => {
    const signedOut = setup({ _tag: 'signedOut' });
    await signedOut.runtime.signIn();
    expect(signedOut.options.portal.beginSignIn).toHaveBeenCalledWith({ forceLogin: false });
    // Otherwise the remembered browser session returns at once and switching is impossible.
    const switching = setup(signedIn('cloud'));
    await switching.runtime.signIn();
    expect(switching.options.portal.beginSignIn).toHaveBeenCalledWith({ forceLogin: true });
  });

  it('makes the next sign-in ask who signs in when a sign-out could not end the portal session', async () => {
    const { runtime, options, publish } = setup(signedIn('cloud'));
    options.portal.signOut.mockImplementationOnce(async () => {
      publish({ _tag: 'signedOut' });
      return { revoked: false, loggedOut: false };
    });
    options.portal.getState.mockReturnValue({ _tag: 'signedOut' });
    await runtime.signOut();
    await runtime.signIn();
    expect(options.portal.beginSignIn).toHaveBeenLastCalledWith({ forceLogin: true });
    // A completed sign-in proves the browser session is current again.
    await runtime.signIn();
    expect(options.portal.beginSignIn).toHaveBeenLastCalledWith({ forceLogin: false });
  });

  it('ends a session it could not take into another organization', async () => {
    const { runtime, options } = setup(signedIn('enterprise'));
    const api = options.createApi();
    api.getConfiguration.mockRejectedValue(new HttpError('Offline', { kind: 'network' }));
    options.createApi.mockReturnValue(api);
    await expect(runtime.signIn()).rejects.toMatchObject({ code: 'connection' });
    expect(options.portal.signOut).toHaveBeenCalledTimes(1);
    expect(options.reload).not.toHaveBeenCalled();
  });

  it('keeps the open organization usable when signing in again cannot reach its server', async () => {
    const { runtime, options } = setup(signedIn('enterprise'), enterpriseProfile);
    await runtime.verify();
    const api = options.createApi();
    api.getConfiguration.mockRejectedValue(new HttpError('Offline', { kind: 'network' }));
    options.createApi.mockReturnValue(api);
    await expect(runtime.signIn()).rejects.toMatchObject({ code: 'connection' });
    expect(options.portal.signOut).not.toHaveBeenCalled();
    expect(runtime.getState()).toMatchObject({ isSignedIn: true, needsSignIn: false });
  });

  it('keeps the open organization in place when the same identity signs in again', async () => {
    const { runtime, options } = setup(signedIn('enterprise'), enterpriseProfile);
    await runtime.verify();
    await expect(runtime.signIn()).resolves.toBe(true);
    expect(options.reload).not.toHaveBeenCalled();
    expect(runtime.getState()).toMatchObject({ isSignedIn: true, needsSignIn: false });
    await expect(runtime.getProductToken()).resolves.toBe('product-token');
  });

  it('still opens the organization when its display name cannot be read', async () => {
    const { runtime, options } = setup(signedIn('enterprise'));
    options.portal.listProfiles.mockRejectedValueOnce(new Error('offline'));
    await expect(runtime.signIn()).resolves.toBe(false);
    expect(options.profiles.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ productProfileId: 'org-1' }),
      'https://cse.example.com',
      undefined,
    );
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

  it('waits for cloud hydration before matching the profile or asking the SDK for a token', async () => {
    let restore!: () => void;
    const ready = new Promise<void>((resolve) => {
      restore = resolve;
    });
    const { runtime, options, publish } = setup({ _tag: 'signedOut' }, enterpriseProfile, ready);
    const token = runtime.getProductToken();
    publish({ _tag: 'signedOut' });
    expect(runtime.getState()).toMatchObject({ isRestoringSession: true, needsSignIn: false });
    expect(options.portal.getProductToken).not.toHaveBeenCalled();

    publish(signedIn('enterprise'));
    restore();
    await expect(token).resolves.toBe('product-token');
    expect(runtime.getState()).toMatchObject({
      isRestoringSession: false,
      isSignedIn: true,
      needsSignIn: false,
    });
  });

  it('finishes hydration and blocks enterprise data when restoring the portal fails', async () => {
    const failure = new Error('Secure storage unavailable');
    const { runtime, options } = setup(
      { _tag: 'signedOut' },
      enterpriseProfile,
      Promise.reject(failure),
    );
    await runtime.verify();
    expect(runtime.getState()).toMatchObject({ isRestoringSession: false, needsSignIn: true });
    await expect(runtime.getProductToken()).rejects.toBe(failure);
    expect(options.portal.getProductToken).not.toHaveBeenCalled();
  });

  it.each([
    ['subject', { ...signedIn('enterprise'), subject: 'user-2' }],
    [
      'organization',
      { ...signedIn('enterprise'), profile: { product: 'enterprise', profileId: 'org-2' } },
    ],
    ['product', { ...signedIn('cloud'), profile: { product: 'cloud', profileId: 'org-1' } }],
    ['signed-out session', { _tag: 'signedOut' }],
  ] as const)(
    'blocks a changed %s in subscriptions, verification and token reads',
    async (_, session) => {
      const { runtime, options, publish } = setup(signedIn('enterprise'), enterpriseProfile);
      await runtime.verify();
      options.portal.getProductToken.mockClear();

      publish(session);
      expect(runtime.getState()).toMatchObject({
        isSignedIn: false,
        needsSignIn: true,
        name: undefined,
      });
      await runtime.verify();
      await expect(runtime.getProductToken()).rejects.toMatchObject({ code: 'rejected' });
      expect(options.portal.getProductToken).not.toHaveBeenCalled();
    },
  );

  it('does not admit a cloud identity restored from another issuer', async () => {
    const { options } = setup(signedIn('enterprise'), enterpriseProfile);
    const runtime = new AccountRuntime({ ...options, issuer: 'https://another-auth' });
    await runtime.verify();
    expect(runtime.getState().needsSignIn).toBe(true);
    await expect(runtime.getProductToken()).rejects.toMatchObject({ code: 'rejected' });
    expect(options.portal.getProductToken).not.toHaveBeenCalled();
  });

  it('keeps a matching cloud session usable when its enterprise server is offline', async () => {
    const { runtime, options } = setup(signedIn('enterprise'), enterpriseProfile);
    options.portal.getProductToken.mockRejectedValueOnce(
      new HttpError('Offline', { kind: 'network' }),
    );
    await runtime.verify();
    expect(runtime.getState()).toMatchObject({
      isRestoringSession: false,
      isSignedIn: true,
      needsSignIn: false,
    });
    await expect(runtime.getProductToken()).resolves.toBe('product-token');
  });

  it('keeps the old cloud profile blocked when replacement succeeds but configuration admission fails', async () => {
    const { runtime, options, publish } = setup(signedIn('enterprise'), enterpriseProfile);
    await runtime.verify();
    options.portal.getProductToken.mockClear();
    const replacement = { ...signedIn('enterprise'), subject: 'user-2', name: 'Other' };
    options.portal.completeSignIn.mockImplementation(async () => {
      expect(runtime.getState().needsSignIn).toBe(true);
      await expect(runtime.getProductToken()).rejects.toMatchObject({ code: 'rejected' });
      publish(replacement);
      return replacement;
    });
    const api = options.createApi();
    api.getConfiguration.mockRejectedValue(new HttpError('Offline', { kind: 'network' }));
    options.createApi.mockReturnValue(api);

    await expect(runtime.signIn()).rejects.toMatchObject({ code: 'connection' });
    expect(runtime.getState()).toMatchObject({
      isBusy: false,
      isSignedIn: false,
      needsSignIn: true,
      name: undefined,
    });
    await expect(runtime.getProductToken()).rejects.toMatchObject({ code: 'rejected' });
    expect(options.portal.getProductToken).not.toHaveBeenCalled();
    expect(options.profiles.setActive).not.toHaveBeenCalled();
  });

  it('keeps the old cloud profile blocked if credential replacement throws before publishing', async () => {
    const { runtime, options } = setup(signedIn('enterprise'), enterpriseProfile);
    await runtime.verify();
    options.portal.completeSignIn.mockRejectedValue(new Error('Failed saving the new session'));
    await expect(runtime.signIn()).rejects.toThrow('Failed saving the new session');
    await runtime.verify();
    expect(runtime.getState().needsSignIn).toBe(true);
    await expect(runtime.getProductToken()).rejects.toMatchObject({ code: 'rejected' });
  });

  it('keeps the active enterprise session usable when the browser is dismissed', async () => {
    const { runtime, options } = setup(signedIn('enterprise'), enterpriseProfile);
    await runtime.verify();
    options.openBrowser.mockResolvedValueOnce(null);
    await expect(runtime.signIn()).resolves.toBe(false);
    expect(runtime.getState().needsSignIn).toBe(false);
    await expect(runtime.getProductToken()).resolves.toBe('product-token');
  });

  it('drops a token that finishes entering the product after the account has changed', async () => {
    const { runtime, options, publish } = setup(signedIn('enterprise'), enterpriseProfile);
    await runtime.verify();
    let finish!: (token: string) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    options.portal.getProductToken.mockImplementationOnce(() => {
      entered();
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const token = runtime.getProductToken();
    const rejection = expect(token).rejects.toMatchObject({ code: 'rejected' });
    await started;
    publish({ ...signedIn('enterprise'), subject: 'user-2' });
    finish('late-token');
    await rejection;
  });

  it('signs into a private deployment without a portal and persists tokens before switching', async () => {
    const { options } = setup({ _tag: 'signedOut' });
    options.profiles.resolve.mockReturnValue(privateProfile);
    const api = options.createPrivateApi();
    options.createPrivateApi.mockReturnValue(api);
    const runtime = new AccountRuntime({ ...options, portal: null });
    expect(runtime.getState()).toMatchObject({
      isCloudSignInAvailable: false,
      isRestoringSession: false,
    });
    await runtime.signIn({
      address: 'private.example.com/api/',
      username: ' Ada ',
      password: ' secret ',
    });
    expect(api.signIn).toHaveBeenCalledWith('Ada', ' secret ');
    expect(options.createPrivateApi).toHaveBeenLastCalledWith('https://private.example.com/api');
    expect(options.profiles.resolve).toHaveBeenCalledWith(
      privateProfile.identity,
      privateProfile.address,
    );
    expect(options.credentials.write).toHaveBeenCalledWith(
      privateProfile.id,
      JSON.stringify(privateCredentials),
    );
    expect(options.credentials.write.mock.invocationCallOrder[0]).toBeLessThan(
      options.profiles.setActive.mock.invocationCallOrder[0]!,
    );
    expect(options.profiles.setActive).toHaveBeenCalledWith(privateProfile);
    expect(options.openBrowser).not.toHaveBeenCalled();
  });

  it('keeps the active profile and credentials when a private password is rejected', async () => {
    const { runtime, options } = setup({ _tag: 'signedOut' });
    const api = options.createPrivateApi();
    api.signIn.mockRejectedValue(new HttpError('Unauthorized', { kind: 'http', status: 401 }));
    options.createPrivateApi.mockReturnValue(api);
    await expect(
      runtime.signIn({ address: privateProfile.address!, username: 'Ada', password: 'bad' }),
    ).rejects.toMatchObject({ code: 'credentials' });
    expect(options.credentials.write).not.toHaveBeenCalled();
    expect(options.profiles.setActive).not.toHaveBeenCalled();
    expect(options.openBrowser).not.toHaveBeenCalled();
  });

  it('restores a private session independently of a signed-out portal, including offline starts', async () => {
    const { runtime, options } = setup({ _tag: 'signedOut' }, privateProfile);
    const api = options.createApi();
    api.getUser.mockRejectedValue(new HttpError('Offline', { kind: 'network' }));
    options.createApi.mockReturnValue(api);
    await runtime.verify();
    options.portal.subscribe.mock.calls[0]![0]({ _tag: 'signedOut' });
    expect(runtime.getState()).toMatchObject({
      isSignedIn: true,
      needsSignIn: false,
      name: 'Ada',
      privateAddress: privateProfile.address,
    });
    expect(await runtime.getProductToken()).toBe('private-token');
    expect(options.portal.getProductToken).not.toHaveBeenCalled();
  });

  it('preserves the independent private session after a failed cloud sign-in', async () => {
    const { runtime, options, publish } = setup(signedIn('cloud'), privateProfile);
    await runtime.verify();
    options.portal.completeSignIn.mockImplementation(async () => {
      publish({ ...signedIn('enterprise'), subject: 'user-2' });
      throw new Error('Cloud sign-in failed');
    });
    await expect(runtime.signIn()).rejects.toThrow('Cloud sign-in failed');
    expect(runtime.getState()).toMatchObject({ isSignedIn: true, needsSignIn: false, name: 'Ada' });
    await expect(runtime.getProductToken()).resolves.toBe('private-token');
  });

  it('shares concurrent refreshes and does not rotate again for a late 401 from the old token', async () => {
    const { runtime, options } = setup({ _tag: 'signedOut' }, privateProfile);
    const api = options.createPrivateApi();
    options.createPrivateApi.mockReturnValue(api);
    await Promise.all([
      runtime.refuseProductToken('private-token'),
      runtime.refuseProductToken('private-token'),
    ]);
    await runtime.refuseProductToken('private-token');
    expect(await runtime.getProductToken()).toBe('rotated-token');
    expect(runtime.getState().needsSignIn).toBe(false);
    expect(api.refresh).toHaveBeenCalledTimes(1);
    expect(JSON.parse(options.credentials.write.mock.calls[0]![1])).toMatchObject({
      refreshToken: 'refresh-2',
    });
  });

  it('rejects a rotated identity before it can overwrite stored credentials', async () => {
    const { runtime, options } = setup({ _tag: 'signedOut' }, privateProfile);
    const api = options.createPrivateApi();
    api.refresh.mockResolvedValue({
      ...privateCredentials,
      user: { id: 'someone-else', username: 'Other' },
    });
    options.createPrivateApi.mockReturnValue(api);
    await expect(runtime.refuseProductToken('private-token')).rejects.toMatchObject({
      code: 'rejected',
    });
    expect(options.credentials.write).not.toHaveBeenCalled();
    expect(runtime.getState().needsSignIn).toBe(true);
  });

  it('does not let an in-flight refresh recreate credentials after sign-out', async () => {
    const { runtime, options } = setup({ _tag: 'signedOut' }, privateProfile);
    const api = options.createPrivateApi();
    let finish!: (value: typeof privateCredentials) => void;
    let started!: () => void;
    const pending = new Promise<void>((resolve) => {
      started = resolve;
    });
    api.refresh.mockImplementation(() => {
      started();
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    options.createPrivateApi.mockReturnValue(api);
    const refresh = runtime.refuseProductToken('private-token');
    const rejection = expect(refresh).rejects.toMatchObject({ code: 'rejected' });
    await pending;
    const signOut = runtime.signOut();
    finish(privateCredentials);
    await Promise.all([rejection, signOut]);
    expect(options.credentials.write).not.toHaveBeenCalled();
    expect(options.credentials.delete).toHaveBeenCalledWith(privateProfile.id);
    expect(options.portal.signOut).not.toHaveBeenCalled();
    expect(options.profiles.setActive).toHaveBeenCalledWith(LOCAL_PROFILE);
  });

  it('asks a cloud session to sign in again when the enterprise server refuses its product token', async () => {
    const { runtime } = setup(signedIn('enterprise'), enterpriseProfile);
    await runtime.verify();
    await runtime.refuseProductToken('product-token');
    expect(runtime.getState().needsSignIn).toBe(true);
    await expect(runtime.getProductToken()).rejects.toMatchObject({ code: 'rejected' });
  });

  it('asks a private account to sign in again when its stored credentials are missing', async () => {
    const { runtime, options } = setup({ _tag: 'signedOut' }, privateProfile);
    options.credentials.read.mockResolvedValue(null);
    await runtime.verify();
    expect(runtime.getState().needsSignIn).toBe(true);
  });

  it('refuses a late 401 once sign-out has started deleting credentials', async () => {
    const { runtime, options } = setup({ _tag: 'signedOut' }, privateProfile);
    await runtime.getProductToken();
    let finishDelete!: () => void;
    let started!: () => void;
    const deleting = new Promise<void>((resolve) => {
      started = resolve;
    });
    options.credentials.delete.mockImplementation(() => {
      started();
      return new Promise<void>((resolve) => {
        finishDelete = resolve;
      });
    });
    const signOut = runtime.signOut();
    await deleting;
    await expect(runtime.refuseProductToken('private-token')).rejects.toMatchObject({
      code: 'rejected',
    });
    finishDelete();
    await signOut;
    expect(options.createPrivateApi).not.toHaveBeenCalled();
    expect(options.credentials.write).not.toHaveBeenCalled();
  });
});
