import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';

import type { AccountsPortal, AccountsPortalOptions } from '@cherryinternal/accounts-portal/client';

const patch = 'patches/@cherryinternal__accounts-portal@0.2.0.patch';
const directory = dirname(require.resolve('@cherryinternal/accounts-portal/client'));

/** Execute the installed SDK, with only its pure claim/identity helpers supplied by the fixture. */
async function portal(
  fetch: AccountsPortalOptions['fetch'],
  expired = false,
): Promise<AccountsPortal> {
  const storage = new Map([
    [
      'accounts-portal.access-token',
      JSON.stringify({ token: 'access-a', expiresAt: expired ? 0 : 9_999_999 }),
    ],
    ['accounts-portal.id-token', 'id-a'],
    ['accounts-portal.refresh-token', 'refresh-a'],
    ['accounts-portal.profile', JSON.stringify({ product: 'cloud', profileId: 'account-a' })],
  ]);
  const context = {
    createAccountsPortal: undefined as unknown as (
      options: AccountsPortalOptions,
    ) => AccountsPortal,
    URL,
    URLSearchParams,
    jwtClaims: () => ({ sub: 'subject-a' }),
    accountIdentity: () => ({ displayName: 'Account A' }),
    base64Url: () => 'nonce',
    errorFromResponse: () => new Error('response failed'),
    AccountsPortalError: class extends Error {
      constructor(
        readonly code: string,
        message: string,
      ) {
        super(message);
      }
    },
  };
  const source = readFileSync(join(directory, 'AccountsPortal.js'), 'utf8')
    .replace(/^import[\s\S]*?from "[^"\n]+";\n/gm, '')
    .replace('export const createAccountsPortal =', 'globalThis.createAccountsPortal =');
  runInNewContext(source, context);
  const sdk = context.createAccountsPortal({
    issuer: 'https://identity.example',
    origin: 'https://portal.example',
    clientId: 'client',
    redirectUri: 'app://callback',
    now: () => 1000,
    storage: {
      get: async (key) => storage.get(key) ?? null,
      set: async (key, value) => {
        storage.set(key, value);
      },
      delete: async (key) => {
        storage.delete(key);
      },
    },
    crypto: {
      randomBytes: (length) => new Uint8Array(length),
      sha256: async () => new Uint8Array(32),
    },
    fetch,
  });
  await sdk.ready;
  return sdk;
}
const response = (body: object) => new Response(JSON.stringify(body), { status: 200 });

test('registers the patch and locks its hash', () => {
  const hash = createHash('sha256').update(readFileSync(patch)).digest('hex');
  expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain(patch);
  expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain(hash);
  expect(readFileSync(join(directory, 'AccountsPortal.d.ts'), 'utf8')).toContain(
    'getIdentityTokens()',
  );
});

test('returns the refreshed matched pair instead of mixing old ID and new access tokens', async () => {
  const fetch: NonNullable<AccountsPortalOptions['fetch']> = async () =>
    response({ access_token: 'access-new', id_token: 'id-new', expires_in: 3600 });
  const sdk = await portal(fetch, true);
  expect(await sdk.getIdentityTokens()).toEqual({ accessToken: 'access-new', idToken: 'id-new' });
});

test('sign-out wins over a pending identity-token read', async () => {
  let release!: (value: ReturnType<typeof response>) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const fetch: NonNullable<AccountsPortalOptions['fetch']> = async (url) => {
    if (String(url).endsWith('/oauth/v2/token')) {
      entered();
      return new Promise((resolve) => {
        release = resolve;
      });
    }
    return response({});
  };
  const sdk = await portal(fetch, true);
  const result = sdk.getIdentityTokens().then(
    () => 'admitted',
    () => 'rejected',
  );
  await started;
  await sdk.signOut();
  release(response({ access_token: 'late-access', id_token: 'late-id', expires_in: 3600 }));
  expect(await result).toBe('rejected');
  expect(sdk.getState()._tag).toBe('signedOut');
});
