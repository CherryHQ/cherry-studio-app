import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { CacheService, createInMemoryBackendCacheStorage } from '@/backend/data/CacheService';

import { RegionService } from '../RegionService';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({ request: (request: unknown) => mockRequest(request) }),
}));

let cache: CacheService;
let region: RegionService;

beforeEach(async () => {
  mockRequest.mockReset();
  cache = new CacheService(createInMemoryBackendCacheStorage());
  await cache._doInit();
  await installTestHost({ CacheService: cache });
  region = new RegionService();
  await region._doInit();
});
afterEach(async () => {
  await region._doStop();
  await uninstallTestHost();
  await cache._doStop();
});

test('shares one cold-start lookup across consumers and stores only the country', async () => {
  mockRequest.mockResolvedValue({ data: { country: 'CN', ip: '192.0.2.1' } });
  await expect(Promise.all([region.getCountry(), region.getCountry()])).resolves.toEqual([
    'CN',
    'CN',
  ]);
  await expect(region.getCountry()).resolves.toBe('CN');
  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(cache.getPersist('region.last_country')).toBe('CN');
});

test('each new cold start detects again instead of locking the previous country', async () => {
  cache.setPersist('region.last_country', 'CN');
  mockRequest.mockResolvedValue({ data: { country: 'US' } });
  await expect(region.getCountry()).resolves.toBe('US');
  expect(cache.getPersist('region.last_country')).toBe('US');
});

test.each(['CN', 'JP', null])(
  'offline startup keeps country %s or the global default',
  async (previous) => {
    cache.setPersist('region.last_country', previous);
    mockRequest.mockRejectedValue(new Error('offline'));
    await expect(region.getCountry()).resolves.toBe(previous ?? 'US');
    expect(cache.getPersist('region.last_country')).toBe(previous);
  },
);

test('malformed location data cannot replace the last successful country', async () => {
  cache.setPersist('region.last_country', 'CN');
  mockRequest.mockResolvedValue({ data: { country: 'China' } });
  await expect(region.getCountry()).resolves.toBe('CN');
  expect(cache.getPersist('region.last_country')).toBe('CN');
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
  finish({ data: { country: 'CN' } });
  await Promise.all([rejected, stopping]);
  expect(mockRequest.mock.calls[0]![0].signal.aborted).toBe(true);
  expect(cache.getPersist('region.last_country')).toBeNull();
});
