import { hashLocalFile } from '../fileHash';

const mockFileHash = jest.fn();
jest.mock('@preeternal/react-native-file-hash', () => ({
  fileHash: (...args: unknown[]) => mockFileHash(...args),
}));

const URI = 'file:///cache/archive.zip';

beforeEach(() => jest.clearAllMocks());

test('hashes the URI with SHA-256 and rejects malformed or failed native results', async () => {
  const signal = new AbortController().signal;
  mockFileHash.mockImplementation(async (uri, options) => {
    expect(uri).toBe(URI);
    expect(options).toEqual({ algorithm: 'SHA-256', signal });
    return 'a'.repeat(64);
  });
  expect(await hashLocalFile(URI, signal)).toBe('a'.repeat(64));
  mockFileHash.mockResolvedValueOnce('invalid');
  await expect(hashLocalFile(URI, signal)).rejects.toMatchObject({
    code: 'VERIFICATION_FAILED',
  });
  mockFileHash.mockRejectedValueOnce(new Error('private-path'));
  await expect(hashLocalFile(URI, signal)).rejects.toMatchObject({
    code: 'VERIFICATION_FAILED',
    message: 'VERIFICATION_FAILED',
  });
});

test('preserves cancellation even when native code resolves late', async () => {
  const controller = new AbortController();
  mockFileHash.mockImplementationOnce(async () => {
    controller.abort(new Error('cancelled'));
    return 'a'.repeat(64);
  });
  await expect(hashLocalFile(URI, controller.signal)).rejects.toThrow('cancelled');
});

test('reports a client built without the native module as unavailable', async () => {
  jest.resetModules();
  jest.doMock('@preeternal/react-native-file-hash', () => {
    throw new Error('FileHash could not be found');
  });
  const isolated: typeof import('../fileHash') = jest.requireActual('../fileHash');
  await expect(isolated.hashLocalFile(URI, new AbortController().signal)).rejects.toMatchObject({
    code: 'NATIVE_HASH_UNAVAILABLE',
  });
});
