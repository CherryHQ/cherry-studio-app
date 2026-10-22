import { checkAppStoreRelease } from '../appStoreRelease';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({ request: (request: unknown) => mockRequest(request) }),
}));

beforeEach(() => jest.clearAllMocks());

test('looks up the installed bundle in the selected region and constructs an official store URL', async () => {
  mockRequest.mockResolvedValue({
    data: { results: [{ bundleId: 'com.example.app', trackId: 1234, version: '1.10.0' }] },
  });
  const signal = new AbortController().signal;
  await expect(checkAppStoreRelease('com.example.app', '1.9.0', 'CN', signal)).resolves.toEqual({
    status: 'available',
    channel: 'app-store',
    id: 'app-store:1234:1.10.0',
    currentVersion: '1.9.0',
    latestVersion: '1.10.0',
    notes: null,
    storeUrl: 'https://apps.apple.com/cn/app/id1234',
  });
  expect(mockRequest).toHaveBeenCalledWith(
    expect.objectContaining({ query: { bundleId: 'com.example.app', country: 'CN' }, signal }),
  );
});

test.each([
  { results: [] },
  { results: [{ bundleId: 'another.app', trackId: 1234, version: '9.0.0' }] },
])('missing or unrelated listings are unavailable: %j', async (data) => {
  mockRequest.mockResolvedValue({ data });
  await expect(checkAppStoreRelease('com.example.app', '1.9.0', 'US')).resolves.toEqual({
    status: 'unavailable',
    reason: 'noRelease',
  });
});

test('a store release older than the installed beta does not prompt a downgrade', async () => {
  mockRequest.mockResolvedValue({
    data: { results: [{ bundleId: 'com.example.app', trackId: 1234, version: '1.8.0' }] },
  });
  await expect(checkAppStoreRelease('com.example.app', '1.9.0', 'US')).resolves.toEqual({
    status: 'upToDate',
    currentVersion: '1.9.0',
  });
});

test('lookup failures never imply up-to-date', async () => {
  mockRequest.mockRejectedValue(new Error('Offline'));
  await expect(checkAppStoreRelease('com.example.app', '1.9.0', 'US')).rejects.toThrow('Offline');
});

test('carries the storefront release notes', async () => {
  mockRequest.mockResolvedValue({
    data: {
      results: [
        {
          bundleId: 'com.example.app',
          trackId: 1234,
          version: '1.10.0',
          releaseNotes: '  New in 1.10.0\n• Faster  ',
        },
      ],
    },
  });
  await expect(checkAppStoreRelease('com.example.app', '1.9.0', 'US')).resolves.toMatchObject({
    notes: 'New in 1.10.0\n• Faster',
  });
});
