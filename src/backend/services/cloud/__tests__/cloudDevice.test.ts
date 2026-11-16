import { getRandomBytes } from 'expo-crypto';
import nacl from 'tweetnacl';

import { cloudSignatureHeaders, createCloudIdempotencyKey, type CloudDevice } from '../cloudDevice';

jest.mock('expo-application', () => ({ getAndroidId: jest.fn() }));
jest.mock('expo-secure-store', () => ({ AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'device-only' }));
jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn(),
  randomUUID: () => '018f47a2-7d3b-7c91-b8f5-8b3f4c6d2a10',
}));

// RFC 8032 public fixture, also published in Cloud's device-signature-v2 protocol.
const seed = Uint8Array.from(
  '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60'.match(/../g)!,
  (hex) => parseInt(hex, 16),
);
const key = nacl.sign.keyPair.fromSeed(seed);
const device: CloudDevice = {
  publicKey: Buffer.from(key.publicKey).toString('base64url'),
  machineCode: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
  platform: 'ios',
  sign: (text) =>
    Buffer.from(nacl.sign.detached(new TextEncoder().encode(text), key.secretKey)).toString(
      'base64url',
    ),
};

afterEach(() => jest.restoreAllMocks());

test('creates fresh canonical 32-byte keys with URL-safe encoding and no padding', () => {
  const firstBytes = new Uint8Array(32).fill(251);
  const secondBytes = new Uint8Array(32).fill(255);
  jest.mocked(getRandomBytes).mockReturnValueOnce(firstBytes).mockReturnValueOnce(secondBytes);

  const first = createCloudIdempotencyKey();
  const second = createCloudIdempotencyKey();

  expect(getRandomBytes).toHaveBeenNthCalledWith(1, 32);
  expect(getRandomBytes).toHaveBeenNthCalledWith(2, 32);
  for (const [value, bytes] of [
    [first, firstBytes],
    [second, secondBytes],
  ] as const) {
    expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(value, 'base64url')).toEqual(Buffer.from(bytes));
    expect(Buffer.from(value, 'base64url').toString('base64url')).toBe(value);
  }
  expect(first).not.toBe(second);
});

test('signs exact UTF-8 body bytes and the idempotency key using the published v2 vector', () => {
  jest.spyOn(Date, 'now').mockReturnValue(1710000000000);
  const body =
    '{"model":"deepseek-chat","max_tokens":64,"messages":[{"role":"user","content":"Hello"}]}';
  const headers = cloudSignatureHeaders(
    device,
    'device-id',
    'POST',
    '/v1/messages',
    body,
    device.machineCode,
  );
  expect(headers['Cherry-Body-SHA256']).toBe(
    '862ece927adfbee83d138acac6f093c1d67272618334e96886fb8c11a62097ff',
  );
  expect(headers['Cherry-Signature']).toBe(
    'KLBGmwxKvF2sGoRzNxN_xOMX3gYL864mZp32sZKUITjEEpKm9i661GVtkdPJ6rrvSO4RlCtylFJXKCtjISduCw',
  );
  expect(headers['Idempotency-Key']).toBe(device.machineCode);
  expect(headers['Cherry-Request-ID']).toBe('018f47a2-7d3b-7c91-b8f5-8b3f4c6d2a10');
  expect(
    cloudSignatureHeaders(
      device,
      'device-id',
      'POST',
      '/v1/messages',
      `${body}\n`,
      device.machineCode,
    )['Cherry-Signature'],
  ).not.toBe(headers['Cherry-Signature']);
  expect(
    cloudSignatureHeaders(device, 'device-id', 'POST', '/v1/messages', body, 'another-key')[
      'Cherry-Signature'
    ],
  ).not.toBe(headers['Cherry-Signature']);
});

test('signs the raw query and includes an empty idempotency field for GET', () => {
  jest.spyOn(Date, 'now').mockReturnValue(1710000060000);
  const first = cloudSignatureHeaders(device, 'device-id', 'GET', '/v1/models?limit=1000');
  const second = cloudSignatureHeaders(device, 'device-id', 'GET', '/v1/models?limit=01000');
  expect(first['Cherry-Body-SHA256']).toBe(
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
  expect(first).not.toHaveProperty('Idempotency-Key');
  expect(second['Cherry-Signature']).not.toBe(first['Cherry-Signature']);
});
