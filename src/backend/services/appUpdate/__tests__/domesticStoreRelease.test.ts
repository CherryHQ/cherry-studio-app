import { checkDomesticStoreRelease } from '../domesticStoreRelease';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({ request: (request: unknown) => mockRequest(request) }),
}));

const now = Date.parse('2026-11-02T12:00:00Z');
const published = {
  status: 'published',
  rollout: 'all-supported-devices',
  checkedAt: '2026-11-02T11:55:00Z',
  expiresAt: '2026-11-02T12:55:00Z',
  versionCode: 21,
  versionName: '1.9.0',
  notes: null,
};
const read = (signal?: AbortSignal) =>
  checkDomesticStoreRelease('oppo', 'com.example.app', '1.9.0', 20, signal);
function respond(stores: Record<string, unknown>, packageName = 'com.example.app') {
  mockRequest.mockResolvedValue({ data: { schemaVersion: 1, packageName, stores } });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(now);
  jest.replaceProperty(process, 'env', {
    ...process.env,
    EXPO_PUBLIC_DOMESTIC_STORE_VERSIONS_URL: 'https://updates.example.com/android-stores.json',
  });
});
afterEach(() => jest.restoreAllMocks());

test('uses only the selected store and announces a higher native build of the same version', async () => {
  respond({ oppo: published, xiaomi: { malformed: true } });
  await expect(read()).resolves.toMatchObject({
    status: 'available',
    channel: 'domestic-stores',
    store: 'oppo',
    id: 'domestic-stores:oppo:21',
    latestVersion: '1.9.0',
    expiresAt: Date.parse(published.expiresAt),
  });
});

test.each([20, 19])('does not offer a build that is not newer: %s', async (versionCode) => {
  respond({ oppo: { ...published, versionCode } });
  await expect(read()).resolves.toEqual({ status: 'upToDate', currentVersion: '1.9.0' });
});

test.each([
  undefined,
  { ...published, status: 'unknown' },
  { ...published, status: 'unpublished' },
  { ...published, expiresAt: '2026-11-02T12:00:00Z' },
  { ...published, checkedAt: '2026-11-02T13:00:00Z' },
  { ...published, expiresAt: '2026-11-04T12:00:00Z' },
])('unknown, missing or invalid freshness never means current: %j', async (entry) => {
  respond({ oppo: entry });
  await expect(read()).resolves.toEqual({ status: 'storeOnly', stores: ['oppo'] });
});

test('rejects another app, partial rollouts, and malformed responses', async () => {
  respond({ oppo: published }, 'another.app');
  await expect(read()).rejects.toThrow('package mismatch');
  respond({ oppo: { ...published, rollout: 'staged' } });
  await expect(read()).rejects.toThrow();
  respond({ oppo: { ...published, versionCode: '21' } });
  await expect(read()).rejects.toThrow();
});

test('an unconfigured endpoint offers a store visit without requesting metadata', async () => {
  delete process.env.EXPO_PUBLIC_DOMESTIC_STORE_VERSIONS_URL;
  await expect(read()).resolves.toEqual({ status: 'storeOnly', stores: ['oppo'] });
  expect(mockRequest).not.toHaveBeenCalled();
});

test('cancellation remains cancellation even when a response completes', async () => {
  const controller = new AbortController();
  mockRequest.mockImplementationOnce(async () => {
    controller.abort();
    return {
      data: { schemaVersion: 1, packageName: 'com.example.app', stores: { oppo: published } },
    };
  });
  await expect(read(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
});
