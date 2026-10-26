import { getAndroidId, getIosIdForVendorAsync } from 'expo-application';
import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { Buffer, createHash, generateKeyPairSync, sign } from 'react-native-quick-crypto';

const KEY = 'cherry-account.device-v1';
const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export type CherryDevice = { privateKey: string; publicKey: string; machineCode: string };

/** Keep a separate account device identity; signing keys are never sent to either product. */
export async function readCherryDevice(): Promise<CherryDevice> {
  const stored = await SecureStore.getItemAsync(KEY, OPTIONS);
  if (stored) {
    const value = JSON.parse(stored) as CherryDevice;
    if (
      !value.privateKey ||
      !/^[A-Za-z0-9_-]{43}$/.test(value.publicKey) ||
      !/^[A-Za-z0-9_-]{43}$/.test(value.machineCode)
    )
      throw new Error('storage');
    return value;
  }
  const pair = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'der' },
  });
  if (!pair.publicKey || !pair.privateKey) throw new Error('device');
  const hardware =
    Platform.OS === 'ios'
      ? await getIosIdForVendorAsync()
      : Platform.OS === 'android'
        ? getAndroidId()
        : null;
  if (!hardware) throw new Error('device');
  const value = {
    privateKey: String(pair.privateKey),
    publicKey: Buffer.from(pair.publicKey as Uint8Array)
      .subarray(-32)
      .toString('base64url'),
    machineCode: createHash('sha256')
      .update(`cherry-account-machine-v1:${Platform.OS}:${hardware}`)
      .digest('base64url'),
  };
  await SecureStore.setItemAsync(KEY, JSON.stringify(value), OPTIONS);
  return value;
}

export function signCherryRequest(
  device: CherryDevice,
  deviceId: string,
  method: string,
  target: string,
  body = '',
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const requestId = randomUUID();
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const canonical = [
    'cherry-device-signature-v2',
    method.toUpperCase(),
    target,
    timestamp,
    requestId,
    bodyHash,
    '',
    device.machineCode,
  ].join('\n');
  return {
    'Cherry-Device-ID': deviceId,
    'Cherry-Signature-Version': '2',
    'Cherry-Timestamp': timestamp,
    'Cherry-Request-ID': requestId,
    'Cherry-Body-SHA256': bodyHash,
    'Cherry-Machine-Code': device.machineCode,
    'Cherry-Signature': sign(null, Buffer.from(canonical), device.privateKey).toString('base64url'),
  };
}
