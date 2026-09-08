import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
  randomUUID,
} from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import type { PluginId } from '@/shared/contracts/plugins';

const KEY_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const encoder = new TextEncoder();

export async function encryptPluginCredential(pluginId: PluginId, credential: string) {
  const credentialKeyId = `plugin.${randomUUID()}`;
  const key = await AESEncryptionKey.generate();
  const sealed = await aesEncryptAsync(encoder.encode(credential), key, {
    additionalData: encoder.encode(`${pluginId}:${credentialKeyId}`),
  });
  const credentialCiphertext = await sealed.combined('base64');
  await SecureStore.setItemAsync(credentialKeyId, await key.encoded('base64'), KEY_OPTIONS);
  return { credentialCiphertext, credentialKeyId };
}

export async function decryptPluginCredential(grant: {
  pluginId: PluginId;
  credentialCiphertext: string;
  credentialKeyId: string;
}): Promise<string> {
  try {
    const encodedKey = await SecureStore.getItemAsync(grant.credentialKeyId, KEY_OPTIONS);
    if (!encodedKey) throw new Error('Missing key');
    const bytes = await aesDecryptAsync(
      AESSealedData.fromCombined(grant.credentialCiphertext),
      await AESEncryptionKey.import(encodedKey, 'base64'),
      { additionalData: encoder.encode(`${grant.pluginId}:${grant.credentialKeyId}`) },
    );
    return new TextDecoder().decode(bytes);
  } catch {
    throw new Error('Plugin credential is unavailable. Connect the plugin again.');
  }
}

export async function removePluginCredentialKey(keyId: string): Promise<void> {
  await SecureStore.deleteItemAsync(keyId, KEY_OPTIONS);
}
