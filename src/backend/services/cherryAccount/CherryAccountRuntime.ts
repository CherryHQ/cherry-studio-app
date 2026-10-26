import { createAccountsPortal, type AccountsPortal } from '@cherryinternal/accounts-portal/client';
import Constants from 'expo-constants';
import {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
  getRandomBytes,
} from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { Buffer } from 'react-native-quick-crypto';

import {
  AppStatePolicy,
  BaseService,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { CherryAccountModule, CherryAccountStatus } from '@/shared/contracts/cherryAccount';

import { cherryAccountConfig } from './cherryAccountConfig';
import { readCherryDevice, signCherryRequest, type CherryDevice } from './cherryDevice';

const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

@Injectable('CherryAccountRuntime')
@ServicePhase(Phase.Gate)
@AppStatePolicy('continue')
export class CherryAccountRuntime extends BaseService implements CherryAccountModule {
  private client?: AccountsPortal;
  private active = false;
  private stopped = false;
  private abort = new AbortController();
  private cloudDeviceId?: string;
  private device?: CherryDevice;
  private verifiedName?: string;
  private storagePrefix = '';

  private getClient(): AccountsPortal | null {
    if (this.stopped) throw new Error('cancelled');
    const config = cherryAccountConfig();
    if (!config) return null;
    if (this.client) return this.client;
    const prefix = `cherry.${Buffer.from(config.issuer + '/' + config.clientId).toString('base64url')}.`;
    this.storagePrefix = prefix;
    this.client = createAccountsPortal({
      issuer: config.issuer,
      origin: config.portal,
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      scopes: config.scopes,
      storage: {
        get: (key) => SecureStore.getItemAsync(prefix + key, OPTIONS),
        set: async (key, value) => {
          if (this.stopped) throw new Error('cancelled');
          await SecureStore.setItemAsync(prefix + key, value, OPTIONS);
        },
        delete: (key) => SecureStore.deleteItemAsync(prefix + key, OPTIONS),
      },
      crypto: {
        randomBytes: getRandomBytes,
        sha256: async (value) =>
          new Uint8Array(
            Buffer.from(
              await digestStringAsync(CryptoDigestAlgorithm.SHA256, value, {
                encoding: CryptoEncoding.HEX,
              }),
              'hex',
            ),
          ),
      },
      fetch: async (input, init) => {
        const url = String(input);
        if (url === `${config.cloud}/accounts-portal/v1/enter`) {
          this.device ??= await readCherryDevice();
          const request = JSON.parse(String(init?.body)) as { profileId: string; idToken: string };
          const response = await fetch(url, {
            ...init,
            signal: this.abort.signal,
            body: JSON.stringify({
              profile: request.profileId,
              id_token: request.idToken,
              device_public_key: this.device.publicKey,
              machine_code: this.device.machineCode,
              platform: Platform.OS,
              client_version: Constants.expoConfig?.version || '0.4.0',
            }),
          });
          if (!response.ok) return response;
          const result = await response.json();
          const token = result.token_set;
          if (
            !token?.access_token ||
            !Number.isFinite(token.expires_in) ||
            !result.account?.device?.id
          )
            throw new Error('invalid_response');
          this.cloudDeviceId = result.account.device.id;
          this.verifiedName = result.account.account?.display_name;
          return new Response(
            JSON.stringify({
              accessToken: token.access_token,
              tokenType: 'Bearer',
              expiresIn: token.expires_in,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return fetch(input, { ...init, signal: this.abort.signal });
      },
    });
    return this.client;
  }

  async getStatus(): Promise<CherryAccountStatus> {
    const client = this.getClient();
    if (!client) return { configured: false, signedIn: false };
    await client.ready;
    const state = client.getState();
    const config = cherryAccountConfig()!;
    if (state._tag !== 'signedIn') return { configured: true, signedIn: false };
    const saved = await SecureStore.getItemAsync(this.storagePrefix + 'entry', OPTIONS);
    const entered = saved ? JSON.parse(saved) : null;
    if (
      !state.profile ||
      entered?.subject !== state.subject ||
      entered?.product !== state.profile.product ||
      entered?.profileId !== state.profile.profileId
    )
      return { configured: true, signedIn: false };
    this.verifiedName ||= entered.displayName;
    return {
      configured: true,
      signedIn: true,
      displayName: this.verifiedName || state.name,
      destination: state.profile?.product,
      profileId: state.profile?.profileId,
      profileUrl: `${config.portal}/profile`,
    };
  }

  async signIn(
    openBrowser: (url: string, redirectUri: string) => Promise<string | null>,
    signal?: AbortSignal,
  ): Promise<CherryAccountStatus> {
    if (this.active) throw new Error('busy');
    this.active = true;
    try {
      const client = this.getClient();
      if (!client) throw new Error('configuration');
      const { url, redirectUri } = await client.beginSignIn();
      const result = await openBrowser(url, redirectUri);
      if (!result || signal?.aborted || this.stopped) throw new Error('cancelled');
      const state = await client.completeSignIn(result);
      if (state._tag !== 'signedIn' || !state.profile) throw new Error('no_profile');
      const config = cherryAccountConfig()!;
      const productOrigin = config[state.profile.product];
      const accessToken = await client.getProductToken(productOrigin);
      // Complete entry before returning to the app. No second business confirmation.
      const path = state.profile.product === 'cloud' ? '/api/v1/account' : '/users/me';
      const signature =
        state.profile.product === 'cloud' && this.device && this.cloudDeviceId
          ? signCherryRequest(this.device, this.cloudDeviceId, 'GET', path)
          : {};
      const response = await fetch(productOrigin + path, {
        headers: { authorization: `Bearer ${accessToken}`, ...signature },
        signal: this.abort.signal,
      });
      if (!response.ok) throw new Error('entry_failed');
      const person = await response.json();
      this.verifiedName =
        state.profile.product === 'cloud'
          ? person.account?.display_name
          : person.displayName || person.nickname || state.name;
      if (signal?.aborted || this.stopped) throw new Error('cancelled');
      await SecureStore.setItemAsync(
        this.storagePrefix + 'entry',
        JSON.stringify({
          subject: state.subject,
          product: state.profile.product,
          profileId: state.profile.profileId,
          displayName: this.verifiedName,
        }),
        OPTIONS,
      );
      return this.getStatus();
    } finally {
      this.active = false;
    }
  }

  async signOut(): Promise<void> {
    if (this.active) throw new Error('busy');
    const client = this.getClient();
    if (client) {
      await client.signOut();
      await SecureStore.deleteItemAsync(this.storagePrefix + 'entry', OPTIONS);
    }
    this.cloudDeviceId = undefined;
    this.verifiedName = undefined;
  }

  protected onStop(): void {
    this.stopped = true;
    this.abort.abort();
  }
}
