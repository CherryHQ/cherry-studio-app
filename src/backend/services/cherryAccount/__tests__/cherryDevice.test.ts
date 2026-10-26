import { createPublicKey, verify } from 'node:crypto';

import { readCherryDevice, signCherryRequest } from '../cherryDevice';

const mockStorage = new Map<string, string>();
jest.mock('react-native-quick-crypto', () => ({
  ...jest.requireActual('node:crypto'),
  Buffer: jest.requireActual('buffer').Buffer,
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => '8d962d12-e27b-41b5-984d-1aa08c359abc' }));
jest.mock('expo-application', () => ({
  getAndroidId: () => 'test-device',
  getIosIdForVendorAsync: async () => 'test-device',
}));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: async (key: string) => mockStorage.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockStorage.set(key, value);
  },
}));

it('persists one Ed25519 identity and produces the server v2 canonical signature', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(1792998000000);
  try {
    const device = await readCherryDevice();
    expect(await readCherryDevice()).toEqual(device);
    expect(device.publicKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(device.machineCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const headers = signCherryRequest(device, 'device-1', 'get', '/api/v1/me');
    const canonical = [
      'cherry-device-signature-v2',
      'GET',
      '/api/v1/me',
      '1792998000',
      '8d962d12-e27b-41b5-984d-1aa08c359abc',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      '',
      device.machineCode,
    ].join('\n');
    const key = createPublicKey({
      key: Buffer.concat([
        Buffer.from('302a300506032b6570032100', 'hex'),
        Buffer.from(device.publicKey, 'base64url'),
      ]),
      format: 'der',
      type: 'spki',
    });
    expect(
      verify(
        null,
        Buffer.from(canonical),
        key,
        Buffer.from(headers['Cherry-Signature'], 'base64url'),
      ),
    ).toBe(true);
    expect(
      verify(
        null,
        Buffer.from(canonical.replace('/api/v1/me', '/api/v1/other')),
        key,
        Buffer.from(headers['Cherry-Signature'], 'base64url'),
      ),
    ).toBe(false);
    expect(JSON.stringify(headers)).not.toContain('PRIVATE KEY');
  } finally {
    jest.restoreAllMocks();
  }
});
