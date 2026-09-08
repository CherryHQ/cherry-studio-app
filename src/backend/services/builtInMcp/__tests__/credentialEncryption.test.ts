import * as SecureStore from 'expo-secure-store';

import {
  decryptPluginCredential,
  encryptPluginCredential,
  removePluginCredentialKey,
} from '../credentialEncryption';

const mockKeys = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 4,
  setItemAsync: jest.fn(async (id: string, value: string) => {
    mockKeys.set(id, value);
  }),
  getItemAsync: jest.fn(async (id: string) => mockKeys.get(id) ?? null),
  deleteItemAsync: jest.fn(async (id: string) => {
    mockKeys.delete(id);
  }),
}));

// Exercise the adapter's byte/base64 and AAD contract with real AES-GCM. Native
// Expo key objects are substituted at the platform boundary only.
jest.mock('expo-crypto', () => {
  const { randomBytes, randomUUID, webcrypto } =
    jest.requireActual<typeof import('node:crypto')>('node:crypto');
  const keyBytes = (value: string | Uint8Array) =>
    new Uint8Array(typeof value === 'string' ? Buffer.from(value, 'base64') : value);
  class Key {
    readonly data: Uint8Array<ArrayBuffer>;
    constructor(data: Uint8Array) {
      this.data = new Uint8Array(data);
    }
    static async generate() {
      return new Key(randomBytes(32));
    }
    static async import(value: string) {
      return new Key(Buffer.from(value, 'base64'));
    }
    async encoded() {
      return Buffer.from(this.data).toString('base64');
    }
  }
  class Sealed {
    readonly data: Uint8Array<ArrayBuffer>;
    constructor(data: Uint8Array) {
      this.data = new Uint8Array(data);
    }
    static fromCombined(value: string) {
      return new Sealed(Buffer.from(value, 'base64'));
    }
    async combined() {
      return Buffer.from(this.data).toString('base64');
    }
  }
  return {
    randomUUID,
    AESEncryptionKey: Key,
    AESSealedData: Sealed,
    aesEncryptAsync: async (
      plaintext: string | Uint8Array,
      key: Key,
      options: { additionalData: Uint8Array },
    ) => {
      const iv = randomBytes(12);
      const imported = await webcrypto.subtle.importKey('raw', key.data, 'AES-GCM', false, [
        'encrypt',
      ]);
      const encrypted = await webcrypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: new Uint8Array(options.additionalData) },
        imported,
        keyBytes(plaintext),
      );
      return new Sealed(Buffer.concat([iv, new Uint8Array(encrypted)]));
    },
    aesDecryptAsync: async (sealed: Sealed, key: Key, options: { additionalData: Uint8Array }) => {
      const imported = await webcrypto.subtle.importKey('raw', key.data, 'AES-GCM', false, [
        'decrypt',
      ]);
      return new Uint8Array(
        await webcrypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: sealed.data.slice(0, 12),
            additionalData: new Uint8Array(options.additionalData),
          },
          imported,
          sealed.data.slice(12),
        ),
      );
    },
  };
});

beforeEach(() => {
  mockKeys.clear();
  jest.clearAllMocks();
});

it('stores only the encryption key in device-only storage and round-trips the credential', async () => {
  const credential = 'github_pat_fixture+/=123';
  const encrypted = await encryptPluginCredential('github', credential);
  expect(encrypted.credentialCiphertext).not.toContain(credential);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    encrypted.credentialKeyId,
    expect.any(String),
    { keychainAccessible: 4 },
  );
  expect([...mockKeys.values()]).not.toContain(credential);
  await expect(decryptPluginCredential({ pluginId: 'github', ...encrypted })).resolves.toBe(
    credential,
  );
  await removePluginCredentialKey(encrypted.credentialKeyId);
  await expect(decryptPluginCredential({ pluginId: 'github', ...encrypted })).rejects.toThrow(
    'Connect the plugin again',
  );
});

it('rejects ciphertext moved to another provider or encryption-key identity', async () => {
  const encrypted = await encryptPluginCredential('github', 'fixture-token');
  await expect(decryptPluginCredential({ pluginId: 'amap', ...encrypted })).rejects.toThrow(
    'unavailable',
  );
  mockKeys.set('plugin.other', mockKeys.get(encrypted.credentialKeyId)!);
  await expect(
    decryptPluginCredential({ pluginId: 'github', ...encrypted, credentialKeyId: 'plugin.other' }),
  ).rejects.toThrow('unavailable');
});
