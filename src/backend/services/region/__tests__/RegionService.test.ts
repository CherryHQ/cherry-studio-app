import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { CacheService, createInMemoryBackendCacheStorage } from '@/backend/data/CacheService';

import { RegionService } from '../RegionService';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({ request: (request: unknown) => mockRequest(request) }),
}));

let cache: CacheService;
let region: RegionService;
let storage: ReturnType<typeof createInMemoryBackendCacheStorage>;

beforeEach(async () => {
  mockRequest.mockReset();
  storage = createInMemoryBackendCacheStorage();
  cache = new CacheService(storage);
  await cache._doInit();
  await installTestHost({ CacheService: cache });
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

test('failed detection defaults to CN and remains retryable', async () => {
  mockRequest
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ data: { country_code: 'JP' } });
  await expect(region.getCountry()).resolves.toBe('CN');
  expect(cache.get('region.egress_country')).toBeUndefined();
  await expect(region.getCountry()).resolves.toBe('JP');
});

test('an expired global country does not override the CN failure fallback', async () => {
  let now = 0;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  cache.set('region.egress_country', 'US', 1);
  now = 2;
  mockRequest.mockRejectedValue(new Error('offline'));
  await expect(region.getCountry()).resolves.toBe('CN');
  expect(cache.get('region.egress_country')).toBeUndefined();
});

test.each([{ country_code: 'China' }, { country: 'US' }])(
  'malformed Lite response %j uses CN without caching the fallback',
  async (data) => {
    mockRequest.mockResolvedValue({ data });
    await expect(region.getCountry()).resolves.toBe('CN');
    expect(cache.get('region.egress_country')).toBeUndefined();
  },
);

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
