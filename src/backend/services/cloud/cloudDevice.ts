import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { fromByteArray, toByteArray } from 'base64-js';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import nacl from 'tweetnacl';

import { sha256HexOfText } from '@/shared/utils/sha256';

const STORAGE_OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
const base64url = (bytes: Uint8Array) =>
  fromByteArray(bytes).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
export interface CloudDevice {
  publicKey: string;
  machineCode: string;
  platform: 'ios' | 'android';
  sign(value: string): string;
}

/** Installation identity and signing key are independent and never leave device-only storage. */
export async function loadCloudDevice(): Promise<CloudDevice> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android')
    throw new Error('Unsupported Cloud platform');
  const platform = Platform.OS;
  let identifier =
    platform === 'android'
      ? Application.getAndroidId()
      : await SecureStore.getItemAsync('cloud.machine-id', STORAGE_OPTIONS);
  if (!identifier) {
    identifier = Crypto.randomUUID();
    await SecureStore.setItemAsync('cloud.machine-id', identifier, STORAGE_OPTIONS);
  }
  let seed = await SecureStore.getItemAsync('cloud.signing-seed', STORAGE_OPTIONS);
  if (!seed) {
    seed = fromByteArray(Crypto.getRandomBytes(32));
    await SecureStore.setItemAsync('cloud.signing-seed', seed, STORAGE_OPTIONS);
  }
  const key = nacl.sign.keyPair.fromSeed(toByteArray(seed));
  const machineCode = base64url(
    hmac(
      sha256,
      'cherry-studio:cloud-machine-code:v1',
      `${platform}\0${identifier.toLowerCase().replace(/-/g, '')}`,
    ),
  );
  return {
    platform,
    machineCode,
    publicKey: base64url(key.publicKey),
    sign: (value) => base64url(nacl.sign.detached(new TextEncoder().encode(value), key.secretKey)),
  };
}

export function cloudSignatureHeaders(
  device: CloudDevice,
  deviceId: string,
  method: string,
  path: string,
  body = '',
  idempotencyKey = '',
): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const requestId = Crypto.randomUUID().toLowerCase();
  const digest = sha256HexOfText(body);
  return {
    'Cherry-Device-ID': deviceId,
    'Cherry-Machine-Code': device.machineCode,
    'Cherry-Request-ID': requestId,
    'Cherry-Timestamp': timestamp,
    'Cherry-Body-SHA256': digest,
    'Cherry-Signature-Version': '2',
    'Cherry-Signature': device.sign(
      [
        'cherry-device-signature-v2',
        method,
        path,
        timestamp,
        requestId,
        digest,
        idempotencyKey,
        device.machineCode,
      ].join('\n'),
    ),
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  };
}
