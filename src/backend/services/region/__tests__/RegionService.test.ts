import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { CacheService, createInMemoryBackendCacheStorage } from '@/backend/data/CacheService';
import { LATEST_PRIVACY_POLICY_VERSION } from '@/shared/utils/privacyConsent';

import { RegionService } from '../RegionService';

const mockRequest = jest.fn();
let mockConfigOrigin: unknown = 'https://config.test';
let mockPlatform: string = 'ios';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: { configServiceOrigin: mockConfigOrigin } };
    },
  },
}));
jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatform;
    },
  },
}));
jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({ request: (request: unknown) => mockRequest(request) }),
}));

let cache: CacheService;
let region: RegionService;
let storage: ReturnType<typeof createInMemoryBackendCacheStorage>;
let enabled: boolean;
let version: string;
const consentListeners = new Map<string, Set<() => void>>();
const preferences = {
  getCachedValue: () => version,
  getMultipleCached: () => ({ enabled, version }),
  subscribeChange: (key: string) => (listener: () => void) => {
    const listeners = consentListeners.get(key) ?? new Set();
    listeners.add(listener);
    consentListeners.set(key, listeners);
    return () => listeners.delete(listener);
  },
};

beforeEach(async () => {
  mockRequest.mockReset();
  mockConfigOrigin = 'https://config.test';
  mockPlatform = 'ios';
  enabled = true;
  version = LATEST_PRIVACY_POLICY_VERSION;
  consentListeners.clear();
  storage = createInMemoryBackendCacheStorage();
  cache = new CacheService(storage);
  await cache._doInit();
  await installTestHost({ CacheService: cache, PreferenceService: preferences });
  region = new RegionService();
  await region._doInit();
});
afterEach(async () => {
  await region._doStop();
  await uninstallTestHost();
  await cache._doStop();
  jest.restoreAllMocks();
});

test('shares one Config Service resolve lookup across consumers and caches only the region in memory', async () => {
  mockRequest.mockResolvedValue({ status: 200, data: { region: 'CN' } });
  await expect(Promise.all([region.getRegion(), region.getRegion()])).resolves.toEqual([
    'CN',
    'CN',
  ]);
  await expect(region.getRegion()).resolves.toBe('CN');
  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(cache.get('region.egress_region')).toBe('CN');
  expect(storage.getAllKeys()).toEqual([]);
  expect(mockRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'POST',
      path: '/v1/resolve',
      body: { client: 'mobile', platform: 'ios' },
      credentials: 'omit',
      redirect: 'error',
      maxResponseBytes: 32 * 1024,
    }),
  );
});

test('refreshes the region after the ten-minute success cache expires', async () => {
  let now = 0;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  mockRequest
    .mockResolvedValueOnce({ status: 200, data: { region: 'CN' } })
    .mockResolvedValueOnce({ status: 200, data: { region: 'GLOBAL' } });
  await expect(region.getRegion()).resolves.toBe('CN');
  now = 10 * 60 * 1_000 - 1;
  await expect(region.getRegion()).resolves.toBe('CN');
  now += 2;
  await expect(region.getRegion()).resolves.toBe('GLOBAL');
  expect(cache.get('region.egress_region')).toBe('GLOBAL');
  expect(mockRequest).toHaveBeenCalledTimes(2);
});

test('failed detection keeps the region unknown and remains retryable', async () => {
  mockRequest
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ status: 200, data: { region: 'GLOBAL' } });
  await expect(region.getRegion()).resolves.toBeNull();
  expect(cache.get('region.egress_region')).toBeUndefined();
  await expect(region.getRegion()).resolves.toBe('GLOBAL');
});

test('non-200 Config Service responses keep the region unknown without caching it', async () => {
  mockRequest.mockResolvedValueOnce({ status: 503, data: { region: 'CN' } });
  await expect(region.getRegion()).resolves.toBeNull();
  expect(cache.get('region.egress_region')).toBeUndefined();
});

test('an expired global region is not replaced by an asserted region on failure', async () => {
  let now = 0;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  cache.set('region.egress_region', 'GLOBAL', 1);
  now = 2;
  mockRequest.mockRejectedValue(new Error('offline'));
  await expect(region.getRegion()).resolves.toBeNull();
  expect(cache.get('region.egress_region')).toBeUndefined();
});

test.each([{ region: 'EU' }, { country_code: 'US' }, null])(
  'malformed Config Service response %j keeps the region unknown without caching it',
  async (data) => {
    mockRequest.mockResolvedValue({ status: 200, data });
    await expect(region.getRegion()).resolves.toBeNull();
    expect(cache.get('region.egress_region')).toBeUndefined();
  },
);

test.each([undefined, 'http://config.test', 'https://config.test/subpath'])(
  'missing or invalid Config Service origin (%s) skips requests and returns null',
  async (origin) => {
    mockConfigOrigin = origin;
    await expect(region.getRegion()).resolves.toBeNull();
    expect(mockRequest).not.toHaveBeenCalled();
    expect(cache.get('region.egress_region')).toBeUndefined();
  },
);

test('unsupported platforms skip Config Service requests and return null', async () => {
  mockPlatform = 'web';
  await expect(region.getRegion()).resolves.toBeNull();
  expect(mockRequest).not.toHaveBeenCalled();
  expect(cache.get('region.egress_region')).toBeUndefined();
});

test.each([
  { decision: 'unanswered', consentEnabled: false, policyVersion: '' },
  { decision: 'declined', consentEnabled: false, policyVersion: LATEST_PRIVACY_POLICY_VERSION },
  { decision: 'accepted', consentEnabled: true, policyVersion: LATEST_PRIVACY_POLICY_VERSION },
])(
  'detects and caches the region with an $decision privacy disclosure',
  async ({ consentEnabled, policyVersion }) => {
    enabled = consentEnabled;
    version = policyVersion;
    mockRequest.mockResolvedValue({ status: 200, data: { region: 'GLOBAL' } });
    await expect(region.getRegion()).resolves.toBe('GLOBAL');
    await expect(region.getRegion()).resolves.toBe('GLOBAL');
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(cache.get('region.egress_region')).toBe('GLOBAL');
  },
);

test('changing consent neither aborts a lookup nor clears its cached region', async () => {
  let finish!: (value: unknown) => void;
  mockRequest.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const detected = region.getRegion();
  enabled = false;
  consentListeners.get('app.privacy.data_collection.enabled')?.forEach((listener) => listener());
  expect(mockRequest.mock.calls[0]![0].signal.aborted).toBe(false);
  finish({ status: 200, data: { region: 'CN' } });
  await expect(detected).resolves.toBe('CN');
  enabled = true;
  consentListeners.get('app.privacy.data_collection.enabled')?.forEach((listener) => listener());
  enabled = false;
  consentListeners.get('app.privacy.data_collection.enabled')?.forEach((listener) => listener());
  expect(cache.get('region.egress_region')).toBe('CN');
  await expect(region.getRegion()).resolves.toBe('CN');
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

test('disposal aborts a pending lookup and rejects its late region without caching it', async () => {
  let finish!: (value: unknown) => void;
  mockRequest.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const detected = region.getRegion();
  const rejected = expect(detected).rejects.toMatchObject({ name: 'AbortError' });
  const stopping = region._doStop();
  finish({ status: 200, data: { region: 'CN' } });
  await Promise.all([rejected, stopping]);
  expect(mockRequest.mock.calls[0]![0].signal.aborted).toBe(true);
  expect(cache.get('region.egress_region')).toBeUndefined();
});
