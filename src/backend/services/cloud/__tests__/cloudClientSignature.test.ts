import { cloudClientSignatureHeaders } from '../cloudClientSignature';

const mockSignCloudRequest = jest.fn();
jest.mock('../../../../../modules/cloud-signing', () => ({
  signCloudRequest: (...args: unknown[]) => mockSignCloudRequest(...args),
}));

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(1710000000000);
  mockSignCloudRequest.mockReset().mockResolvedValue('a'.repeat(64));
});
afterEach(() => jest.restoreAllMocks());

test.each(['/v1/messages', '/v1/chat/completions'])(
  'signs the exact request text for %s using the Cloud application header contract',
  async (path) => {
    const body = '{"model":"cloud-model","messages":[{"role":"user","content":"你好"}]}\n';
    await expect(cloudClientSignatureHeaders('post', path, body)).resolves.toEqual({
      'X-Client-ID': 'cherry-studio',
      'X-Timestamp': '1710000000',
      'X-Signature': 'a'.repeat(64),
    });
    expect(mockSignCloudRequest).toHaveBeenCalledWith(
      `POST\n${path}\n\ncherry-studio\n1710000000\n${body}`,
    );
  },
);

test('omits application headers when the optional native credential is unavailable', async () => {
  mockSignCloudRequest.mockResolvedValue(null);
  await expect(cloudClientSignatureHeaders('POST', '/v1/messages', '{}')).resolves.toEqual({});
});

test('propagates a configured signing failure', async () => {
  mockSignCloudRequest.mockRejectedValue(new Error('Native signing failed'));
  await expect(cloudClientSignatureHeaders('POST', '/v1/messages', '{}')).rejects.toThrow(
    'Native signing failed',
  );
});

test('signs the encoded path, raw catalog query and zero-byte body separately', async () => {
  await cloudClientSignatureHeaders('GET', '/v1/models?limit=1000', '');
  expect(mockSignCloudRequest).toHaveBeenCalledWith(
    'GET\n/v1/models\nlimit=1000\ncherry-studio\n1710000000\n',
  );
});
