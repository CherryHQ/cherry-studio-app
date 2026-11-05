import { createAccountsPortal, type AuthState } from '@cherryinternal/accounts-portal/client';
import { loggerService } from '@logger';
import { reloadAppAsync } from 'expo';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { createMMKV } from 'react-native-mmkv';
import * as z from 'zod';

import {
  AccountRuntime,
  createEnterpriseApi,
  createPrivateAccountApi,
} from '@/backend/services/enterprise';
import { createFetchBridge } from '@/backend/services/http';
import { nativeCallbackUrl } from '@/backend/utils/oauth';
import {
  AccountError,
  type AccountSessionContext,
  AccountSessionContextSchema,
} from '@/shared/contracts/account';
import { getActiveProfile } from '@/shared/data/activeProfile';
import { sha256HexOfText } from '@/shared/utils/sha256';

import { setDiagnosticAccountReader } from '../runtime/diagnosticContext';
import { installationProfiles } from './installationProfiles';

const ConfigSchema = z.object({
  issuer: z.string().min(1),
  origin: z.string().min(1),
  clientId: z.string().min(1),
  scopes: z.array(z.string()).min(1),
  enterpriseApiBaseUrl: z.string().optional(),
  cloudApiOrigin: z.string().optional(),
  cloudWebUrl: z.string().optional(),
});
const STORAGE_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

let account: AccountRuntime | undefined;

/** Installation-owned: one Accounts Portal session serves every profile of this install. */
export function installationAccount(): AccountRuntime {
  account ??= createAccount();
  return account;
}

function createAccount(): AccountRuntime {
  const parsed = ConfigSchema.safeParse(Constants.expoConfig?.extra?.accountsPortal);
  if (!parsed.success)
    loggerService.withContext('AccountRuntime').error('Cloud sign-in configuration is invalid', {
      fields: parsed.error.issues.map((issue) => issue.path.join('.')),
      operation: 'account.configuration',
    });
  const config = parsed.success ? parsed.data : undefined;
  const store = createMMKV({ id: 'cherry-installation-account' });
  const redirectUri = nativeCallbackUrl('auth/callback');
  const portal =
    config && redirectUri
      ? createAccountsPortal({
          issuer: config.issuer,
          origin: config.origin,
          clientId: config.clientId,
          redirectUri,
          scopes: config.scopes,
          storage: {
            get: (key) => SecureStore.getItemAsync(`accounts-portal.${key}`, STORAGE_OPTIONS),
            set: (key, value) =>
              SecureStore.setItemAsync(`accounts-portal.${key}`, value, STORAGE_OPTIONS),
            delete: (key) => SecureStore.deleteItemAsync(`accounts-portal.${key}`, STORAGE_OPTIONS),
          },
          crypto: {
            randomBytes: Crypto.getRandomBytes,
            sha256: async (value) =>
              new Uint8Array(
                await Crypto.digest(
                  Crypto.CryptoDigestAlgorithm.SHA256,
                  new TextEncoder().encode(value),
                ),
              ),
          },
          // Only the SDK's own endpoints, its profile list and an enterprise product entry, so tokens
          // go nowhere else.
          fetch: createFetchBridge({
            maxResponseBytes: 1024 * 1024,
            timeoutMs: 20_000,
            unsupportedMethodError: () => new AccountError('failed'),
            assertUrl(value) {
              const url = new URL(value);
              const fixed = [
                `${config.issuer}/oauth/v2/token`,
                `${config.issuer}/oauth/v2/revoke`,
                `${config.issuer}/oidc/v1/userinfo`,
                `${config.origin}/api/v1/logout`,
                `${config.origin}/api/v1/profiles`,
              ];
              if (
                !fixed.includes(url.toString()) &&
                !(url.pathname.endsWith('/accounts-portal/v1/enter') && !url.search && !url.hash)
              )
                throw new AccountError('address');
              return url;
            },
          }),
        })
      : null;
  void portal?.ready.catch((error: unknown) => {
    loggerService
      .withContext('AccountRuntime')
      .error('Could not restore the sign-in', error as Error);
  });
  const active = getActiveProfile();
  const runtime = new AccountRuntime({
    portal,
    resolveSessionContext: (session) => resolvePortalSessionContext(session, config),
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
    const context = session ? resolvePortalSessionContext(session, config) : null;
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

/**
 * SDK 0.2.1 has no session service metadata. Its current deployment supplies concrete addresses
 * here from configuration. Replace this mapping with the SDK's session result when available;
 * product code consumes actual addresses and never selects a region.
 */
function resolvePortalSessionContext(
  session: AuthState,
  config: z.infer<typeof ConfigSchema> | undefined,
): AccountSessionContext | null {
  if (session._tag !== 'signedIn') return null;
  const context = AccountSessionContextSchema.safeParse(config);
  return context.success ? context.data : null;
}
