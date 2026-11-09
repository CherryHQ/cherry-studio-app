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

test('does not detect or expose cached countries after consent is declined', async () => {
  enabled = false;
  cache.set('region.egress_country', 'CN', 10_000);
  await expect(region.getCountry()).resolves.toBeNull();
  expect(mockRequest).not.toHaveBeenCalled();
});

test.each([true, false])(
  'waits for the initial policy decision before resolving region (accept: %s)',
  async (accept) => {
    version = '';
    let resolved = false;
    const country = region.getCountry().then((value) => {
      resolved = true;
      return value;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(mockRequest).not.toHaveBeenCalled();
    enabled = accept;
    version = LATEST_PRIVACY_POLICY_VERSION;
    mockRequest.mockResolvedValue({ data: { country_code: 'CN' } });
    consentListeners.get('app.privacy.policy_version')?.forEach((listener) => listener());
    await expect(country).resolves.toBe(accept ? 'CN' : null);
    expect(mockRequest).toHaveBeenCalledTimes(accept ? 1 : 0);
  },
);

test('shutdown cancels a pending policy wait without issuing a lookup', async () => {
  version = '20200101';
  const country = region.getCountry();
  const rejected = expect(country).rejects.toMatchObject({ name: 'AbortError' });
  await region._doStop();
  await rejected;
  expect(mockRequest).not.toHaveBeenCalled();
});

test('revoking consent aborts the lookup and refuses its late country', async () => {
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
  expect(mockRequest.mock.calls[0]![0].signal.aborted).toBe(true);
  finish({ data: { country_code: 'CN' } });
  await expect(country).resolves.toBeNull();
  expect(cache.get('region.egress_country')).toBeUndefined();
  await expect(region.getCountry()).resolves.toBeNull();
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

test('accepting the policy makes a previously skipped lookup retryable', async () => {
  enabled = false;
  await expect(region.getCountry()).resolves.toBeNull();
  enabled = true;
  mockRequest.mockResolvedValue({ data: { country_code: 'US' } });
  await expect(region.getCountry()).resolves.toBe('US');
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

test('revocation clears a previously detected country', async () => {
  mockRequest.mockResolvedValue({ data: { country_code: 'CN' } });
  await expect(region.getCountry()).resolves.toBe('CN');
  enabled = false;
  consentListeners.get('app.privacy.data_collection.enabled')?.forEach((listener) => listener());
  expect(cache.get('region.egress_country')).toBeUndefined();
  await expect(region.getCountry()).resolves.toBeNull();
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
