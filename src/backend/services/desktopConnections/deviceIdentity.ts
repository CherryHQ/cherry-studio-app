import * as SecureStore from 'expo-secure-store';

const IDENTITY_KEY = 'remote-device-identity';
const STORE_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) =>
  Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));

/** One Ed25519 identity per install. Losing it means pairing again, which is the intended bound. */
export async function loadDeviceIdentity(): Promise<Uint8Array> {
  // Loaded on demand: the transport's ESM dependency chain must not ride along with the service registry.
  const { createDeviceIdentity, deviceIdentityId } = await import('@cherrystudio/remote-transport');
  const stored = await SecureStore.getItemAsync(IDENTITY_KEY);
  if (stored) {
    const bytes = fromHex(stored);
    deviceIdentityId(bytes);
    return bytes;
  }
  const identity = await createDeviceIdentity();
  await SecureStore.setItemAsync(IDENTITY_KEY, toHex(identity), STORE_OPTIONS);
  return identity;
}
