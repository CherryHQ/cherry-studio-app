import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { CacheService, createInMemoryBackendCacheStorage } from '@/backend/data/CacheService';
import { LATEST_PRIVACY_POLICY_VERSION } from '@/shared/utils/privacyConsent';

import { RegionService } from '../RegionService';

const mockRequest = jest.fn();
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

test('shares one Lite lookup across consumers and caches only the country in memory', async () => {
  mockRequest.mockResolvedValue({ data: { country_code: 'CN', ip: '192.0.2.1' } });
  await expect(Promise.all([region.getCountry(), region.getCountry()])).resolves.toEqual([
    'CN',
    'CN',
  ]);
  await expect(region.getCountry()).resolves.toBe('CN');
  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(cache.get('region.egress_country')).toBe('CN');
  expect(storage.getAllKeys()).toEqual([]);
  expect(mockRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'GET',
      path: '/lite/me',
      query: { token: expect.any(String) },
      maxResponseBytes: 4_096,
    }),
  );
});

test('refreshes the country after the ten-minute success cache expires', async () => {
  let now = 0;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  mockRequest
    .mockResolvedValueOnce({ data: { country_code: 'CN' } })
    .mockResolvedValueOnce({ data: { country_code: 'US' } });
  await expect(region.getCountry()).resolves.toBe('CN');
  now = 10 * 60 * 1_000 - 1;
  await expect(region.getCountry()).resolves.toBe('CN');
  now += 2;
  await expect(region.getCountry()).resolves.toBe('US');
  expect(cache.get('region.egress_country')).toBe('US');
  expect(mockRequest).toHaveBeenCalledTimes(2);
});

test('failed detection keeps the country unknown and remains retryable', async () => {
  mockRequest
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ data: { country_code: 'JP' } });
  await expect(region.getCountry()).resolves.toBeNull();
  expect(cache.get('region.egress_country')).toBeUndefined();
  await expect(region.getCountry()).resolves.toBe('JP');
});

test('an expired global country is not replaced by an asserted country on failure', async () => {
  let now = 0;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  cache.set('region.egress_country', 'US', 1);
  now = 2;
  mockRequest.mockRejectedValue(new Error('offline'));
  await expect(region.getCountry()).resolves.toBeNull();
  expect(cache.get('region.egress_country')).toBeUndefined();
});

test.each([{ country_code: 'China' }, { country: 'US' }])(
  'malformed Lite response %j keeps the country unknown without caching it',
  async (data) => {
    mockRequest.mockResolvedValue({ data });
    await expect(region.getCountry()).resolves.toBeNull();
    expect(cache.get('region.egress_country')).toBeUndefined();
  },
);

test.each([
  { decision: 'unanswered', consentEnabled: false, policyVersion: '' },
  { decision: 'declined', consentEnabled: false, policyVersion: LATEST_PRIVACY_POLICY_VERSION },
  { decision: 'accepted', consentEnabled: true, policyVersion: LATEST_PRIVACY_POLICY_VERSION },
])(
  'detects and caches the country with an $decision privacy disclosure',
  async ({ consentEnabled, policyVersion }) => {
    enabled = consentEnabled;
    version = policyVersion;
    mockRequest.mockResolvedValue({ data: { country_code: 'US' } });
    await expect(region.getCountry()).resolves.toBe('US');
    await expect(region.getCountry()).resolves.toBe('US');
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(cache.get('region.egress_country')).toBe('US');
  },
);

test('changing consent neither aborts a lookup nor clears its cached country', async () => {
  let finish!: (value: unknown) => void;
  mockRequest.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const country = region.getCountry();
  enabled = false;
  consentListeners.get('app.privacy.data_collection.enabled')?.forEach((listener) => listener());
  expect(mockRequest.mock.calls[0]![0].signal.aborted).toBe(false);
  finish({ data: { country_code: 'CN' } });
  await expect(country).resolves.toBe('CN');
  enabled = true;
  consentListeners.get('app.privacy.data_collection.enabled')?.forEach((listener) => listener());
  enabled = false;
  consentListeners.get('app.privacy.data_collection.enabled')?.forEach((listener) => listener());
  expect(cache.get('region.egress_country')).toBe('CN');
  await expect(region.getCountry()).resolves.toBe('CN');
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

test('disposal aborts a pending lookup and rejects its late country without caching it', async () => {
  let finish!: (value: unknown) => void;
  mockRequest.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const country = region.getCountry();
  const rejected = expect(country).rejects.toMatchObject({ name: 'AbortError' });
  const stopping = region._doStop();
  finish({ data: { country_code: 'CN' } });
  await Promise.all([rejected, stopping]);
  expect(mockRequest.mock.calls[0]![0].signal.aborted).toBe(true);
  expect(cache.get('region.egress_country')).toBeUndefined();
});
