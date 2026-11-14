import { createAccountsPortal, type AuthState } from '@cherryinternal/accounts-portal/client';
import { loggerService } from '@logger';
import { reloadAppAsync } from 'expo';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

import {
  AccountRuntime,
  createEnterpriseApi,
  createPrivateAccountApi,
} from '@/backend/services/enterprise';
import { createFetchBridge } from '@/backend/services/http';
import { nativeCallbackUrl } from '@/backend/utils/oauth';
import { AccountError, type AccountSessionContext } from '@/shared/contracts/account';
import { getActiveProfile } from '@/shared/data/activeProfile';
import { sha256HexOfText } from '@/shared/utils/sha256';

import { setDiagnosticAccountReader } from '../runtime/diagnosticContext';
import {
  configOrigin,
  parseCloudLogin,
  resolveCloudLogin,
  sdkScopes,
  type CloudLoginConfig,
} from './cloudLoginConfig';
import { installationProfiles } from './installationProfiles';

const STORAGE_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

let account: AccountRuntime | undefined;

/** Installation-owned: one Accounts Portal session serves every profile of this install. */
export function installationAccount(): AccountRuntime {
  account ??= createAccount();
  return account;
}

function createAccount(): AccountRuntime {
  const origin = configOrigin(Constants.expoConfig?.extra?.configServiceOrigin);
  const store = createMMKV({ id: 'cherry-installation-account' });
  const redirectUri = nativeCallbackUrl('auth/callback');
  const active = getActiveProfile();
  const bindingKey =
    origin && redirectUri
      ? `accounts-portal.registration.${sha256HexOfText(JSON.stringify([origin, redirectUri]))}`
      : undefined;
  const expectedIssuer =
    active.identity && 'issuer' in active.identity ? active.identity.issuer : undefined;
  let config: CloudLoginConfig | undefined;
  if (bindingKey && redirectUri) {
    try {
      const saved = SecureStore.getItem(bindingKey, STORAGE_OPTIONS);
      if (saved) {
        const registration = parseCloudLogin(JSON.parse(saved), redirectUri);
        if (!expectedIssuer || registration.endpoints.issuer === expectedIssuer)
          config = registration;
      }
    } catch {
      loggerService
        .withContext('AccountRuntime')
        .error('Could not read the cloud login registration');
    }
  }
  let portal = config ? createRegionalPortal(config) : null;
  const sessionContext = (session: AuthState): AccountSessionContext | null =>
    config && session._tag === 'signedIn'
      ? {
          issuer: config.endpoints.issuer,
          enterpriseApiBaseUrl: config.endpoints.api_base_url,
          cloudApiOrigin: config.endpoints.cloud_api_origin,
          cloudWebUrl: config.endpoints.cloud_web_url,
        }
      : null;
  const runtime = new AccountRuntime({
    portal,
    async preparePortal() {
      if (!origin || !redirectUri || !bindingKey) throw new AccountError('unavailable');
      const next = await resolveCloudLogin(origin, Platform.OS, redirectUri, expectedIssuer);
      // Persist before beginSignIn saves PKCE and before handing control to the system browser.
      if (!portal || JSON.stringify(next) !== JSON.stringify(config)) {
        SecureStore.setItem(bindingKey, JSON.stringify(next), STORAGE_OPTIONS);
        portal = createRegionalPortal(next);
        config = next;
      }
      return portal;
    },
    resolveSessionContext: sessionContext,
    active,
    profiles: installationProfiles(),
    prompt: {
      read: () => store.getBoolean('sign-in-prompted') ?? false,
      write: () => store.set('sign-in-prompted', true),
    },
    browserSession: {
      isStale: () => store.getBoolean('browser-session-stale') ?? false,
      setStale: (stale) => store.set('browser-session-stale', stale),
    },
    createApi: (baseUrl, session) => createEnterpriseApi({ baseUrl, session }),
    createPrivateApi: createPrivateAccountApi,
    credentials: {
      read: (id) => SecureStore.getItemAsync(`profile.${id}.private-account`, STORAGE_OPTIONS),
      write: (id, value) =>
        SecureStore.setItemAsync(`profile.${id}.private-account`, value, STORAGE_OPTIONS),
      delete: (id) => SecureStore.deleteItemAsync(`profile.${id}.private-account`, STORAGE_OPTIONS),
    },
    openBrowser: async (url, callbackUrl) => {
      const result = await WebBrowser.openAuthSessionAsync(url, callbackUrl);
      return result.type === 'success' ? result.url : null;
    },
    reload: () => reloadAppAsync('Switch data profile'),
  });
  setDiagnosticAccountReader(() => {
    const state = runtime.getState();
    const accountStatus = state.isRestoringSession
      ? 'restoring'
      : state.needsSignIn
        ? 'sign_in_required'
        : state.isSignedIn
          ? 'signed_in'
          : 'signed_out';
    if (accountStatus !== 'signed_in') return { accountStatus };
    if (active.identity && 'authentication' in active.identity)
      return { accountStatus, accountSubjectId: active.identity.subject };
    const session = portal?.getState();
    const context = session ? sessionContext(session) : null;
    return {
      accountStatus,
      ...(session?._tag === 'signedIn' && context
        ? {
            accountSubjectId: session.subject,
            accountIssuerHash: sha256HexOfText(context.issuer),
          }
        : {}),
    };
  });
  return runtime;
}

function createRegionalPortal(config: CloudLoginConfig) {
  const { issuer, portal_url: origin, api_base_url: enterpriseApi } = config.endpoints;
  // An SDK instance must never find another issuer's tokens or pending PKCE transaction.
  const prefix = sha256HexOfText(
    JSON.stringify([issuer, origin, config.oidc_client_id, config.redirect_uri]),
  );
  const allowed = new Set([
    `${issuer}/oauth/v2/token`,
    `${issuer}/oauth/v2/revoke`,
    `${issuer}/oidc/v1/userinfo`,
    `${origin}/api/v1/logout`,
    `${origin}/api/v1/profiles`,
    `${enterpriseApi}/accounts-portal/v1/enter`,
  ]);
  return createAccountsPortal({
    issuer,
    origin,
    clientId: config.oidc_client_id,
    redirectUri: config.redirect_uri,
    scopes: config.scopes.filter((scope) => !sdkScopes.includes(scope)),
    storage: {
      get: (key) => SecureStore.getItemAsync(`${prefix}.${key}`, STORAGE_OPTIONS),
      set: (key, value) => SecureStore.setItemAsync(`${prefix}.${key}`, value, STORAGE_OPTIONS),
      delete: (key) => SecureStore.deleteItemAsync(`${prefix}.${key}`, STORAGE_OPTIONS),
    },
    crypto: {
      randomBytes: Crypto.getRandomBytes,
      sha256: async (value) =>
        new Uint8Array(
          await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new TextEncoder().encode(value)),
        ),
    },
    fetch: createFetchBridge({
      maxResponseBytes: 1024 * 1024,
      timeoutMs: 20_000,
      unsupportedMethodError: () => new AccountError('failed'),
      assertUrl(value) {
        const url = new URL(value);
        if (!allowed.has(url.toString())) throw new AccountError('address');
        return url;
      },
    }),
  });
}
