import { createAccountsPortal } from '@cherryinternal/accounts-portal/client';
import { loggerService } from '@logger';
import { reloadAppAsync } from 'expo';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { createMMKV } from 'react-native-mmkv';
import * as z from 'zod';

import { createEnterpriseApi, EnterpriseAccount } from '@/backend/services/enterprise';
import { createFetchBridge } from '@/backend/services/http';
import { nativeCallbackUrl } from '@/backend/utils/oauth';
import { EnterpriseError, normalizeEnterpriseAddress } from '@/shared/contracts/enterprise';
import { getActiveProfile } from '@/shared/data/activeProfile';

import { installationProfiles } from './installationProfiles';

const ConfigSchema = z.object({
  issuer: z.string().min(1),
  origin: z.string().min(1),
  clientId: z.string().min(1),
  scopes: z.array(z.string()).min(1),
  enterpriseAddress: z.string(),
});
const STORAGE_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

let account: EnterpriseAccount | undefined;

/** Installation-owned: one Accounts Portal session serves every profile of this install. */
export function enterpriseAccount(): EnterpriseAccount {
  account ??= createEnterpriseAccount();
  return account;
}

function createEnterpriseAccount(): EnterpriseAccount {
  const parsed = ConfigSchema.safeParse(Constants.expoConfig?.extra?.accountsPortal);
  const redirectUri = nativeCallbackUrl('auth/callback');
  const config = parsed.success && redirectUri ? parsed.data : undefined;
  const store = createMMKV({ id: 'cherry-installation-account' });
  const createFetch = (allowed: () => string[]) =>
    createFetchBridge({
      maxResponseBytes: 1024 * 1024,
      timeoutMs: 20_000,
      unsupportedMethodError: () => new EnterpriseError('connection'),
      assertUrl(value) {
        const url = new URL(value);
        if (!allowed().some((prefix) => url.toString() === prefix))
          throw new EnterpriseError('address');
        return url;
      },
    });
  const address = {
    read: () => store.getString('enterprise-address') ?? config?.enterpriseAddress ?? '',
    write: (value: string) => store.set('enterprise-address', value),
  };
  const portal = config
    ? createAccountsPortal({
        issuer: config.issuer,
        origin: config.origin,
        clientId: config.clientId,
        redirectUri: redirectUri!,
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
        // Only the SDK's own endpoints, so a token can never be sent elsewhere.
        fetch: createFetch(() => {
          const permitted = [
            `${config.issuer}/oauth/v2/token`,
            `${config.issuer}/oauth/v2/revoke`,
            `${config.origin}/api/v1/logout`,
          ];
          try {
            permitted.push(
              `${normalizeEnterpriseAddress(address.read())}/accounts-portal/v1/enter`,
            );
          } catch {
            // No usable enterprise address yet.
          }
          return permitted;
        }),
      })
    : null;
  void portal?.ready.catch((error: unknown) => {
    loggerService
      .withContext('EnterpriseAccount')
      .error('Could not restore the sign-in', error as Error);
  });
  return new EnterpriseAccount({
    portal,
    issuer: config?.issuer ?? '',
    active: getActiveProfile(),
    profiles: installationProfiles(),
    address,
    createApi: (baseUrl, getToken) => createEnterpriseApi({ baseUrl, getToken }),
    openBrowser: async (url, callbackUrl) => {
      const result = await WebBrowser.openAuthSessionAsync(url, callbackUrl);
      return result.type === 'success' ? result.url : null;
    },
    reload: () => reloadAppAsync('Switch data profile'),
  });
}
