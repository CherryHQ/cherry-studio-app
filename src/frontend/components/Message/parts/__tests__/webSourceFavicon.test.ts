import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { Image } from 'expo-image';

import { CacheService, cacheService } from '@/frontend/data/CacheService';

import { rejectWebSourceFavicon, webSourceFaviconQueryOptions } from '../webSourceFavicon';

jest.mock('expo-image', () => ({ Image: { prefetch: jest.fn() } }));
jest.mock('@/frontend/data/CacheService', () => {
  const actual = jest.requireActual('@/frontend/data/CacheService');
  const storage = actual.createInMemoryKvStorage();
  return { ...actual, cacheService: new actual.CacheService(storage), testStorage: storage };
});

const CACHE_KEY = 'chat.site_favicons';
const NOW = Date.parse('2026-10-19T00:00:00Z');
const FIVE_MINUTES = 5 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const SITE = 'https://example.com';
const PRIMARY = `${SITE}/favicon.ico`;
const FALLBACK = 'https://icons.duckduckgo.com/ip3/example.com.ico';
const source = { url: `${SITE}/first` };
const prefetch = jest.mocked(Image.prefetch);
const clients: QueryClient[] = [];

function createClient() {
  const client = new QueryClient();
  clients.push(client);
  return client;
}

function deferredImage() {
  let resolve!: (loaded: boolean) => void;
  const promise = new Promise<boolean>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  prefetch.mockReset().mockResolvedValue(true);
  cacheService.deletePersist(CACHE_KEY);
});

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  jest.useRealTimers();
});

test('concurrent articles from the same site share one pending selection', async () => {
  const client = createClient();
  const image = deferredImage();
  prefetch.mockReturnValueOnce(image.promise);

  const first = client.fetchQuery(webSourceFaviconQueryOptions(client, source));
  const second = client.fetchQuery(
    webSourceFaviconQueryOptions(client, { url: `${SITE}/second?query=1` }),
  );
  expect(prefetch).toHaveBeenCalledTimes(1);
  image.resolve(true);

  expect(await Promise.all([first, second])).toEqual([PRIMARY, PRIMARY]);
  expect(prefetch).toHaveBeenCalledWith(PRIMARY, 'memory-disk');
  expect(Object.keys(cacheService.getPersist(CACHE_KEY))).toEqual([SITE]);
});

test('restores a successful fallback after restart without retrying the failed primary', async () => {
  const client = createClient();
  const explicitSource = { ...source, faviconUrl: PRIMARY };
  prefetch.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  expect(await client.fetchQuery(webSourceFaviconQueryOptions(client, explicitSource))).toBe(
    FALLBACK,
  );

  const cache = jest.requireMock('@/frontend/data/CacheService');
  cache.cacheService = new CacheService(cache.testStorage);
  expect(cacheService.getPersist(CACHE_KEY)).toEqual({
    [SITE]: { url: FALLBACK, resolvedAt: NOW, faviconUrl: PRIMARY },
  });

  const restarted = createClient();
  expect(
    await restarted.fetchQuery(
      webSourceFaviconQueryOptions(restarted, { ...explicitSource, url: `${SITE}/second` }),
    ),
  ).toBe(FALLBACK);
  expect(prefetch).toHaveBeenCalledTimes(2);
});

test('repeated failures stay quiet until the five-minute cooldown expires', async () => {
  const client = createClient();
  prefetch.mockResolvedValue(false);
  const resolve = () => client.fetchQuery(webSourceFaviconQueryOptions(client, source));
  expect(await resolve()).toBeNull();
  expect(prefetch).toHaveBeenCalledTimes(2);

  jest.setSystemTime(NOW + FIVE_MINUTES - 1);
  expect(await resolve()).toBeNull();
  expect(prefetch).toHaveBeenCalledTimes(2);

  jest.setSystemTime(NOW + FIVE_MINUTES);
  prefetch.mockResolvedValue(true);
  expect(await resolve()).toBe(PRIMARY);
  expect(prefetch).toHaveBeenCalledTimes(3);
});

test('expired metadata refreshes on access while retaining the previous image', async () => {
  cacheService.setPersist(CACHE_KEY, {
    [SITE]: { url: FALLBACK, resolvedAt: NOW - SEVEN_DAYS + 1 },
  });
  const client = createClient();
  const options = webSourceFaviconQueryOptions(client, source);
  expect(await client.fetchQuery(options)).toBe(FALLBACK);
  expect(prefetch).not.toHaveBeenCalled();

  jest.setSystemTime(NOW + 1);
  const image = deferredImage();
  prefetch.mockReturnValueOnce(image.promise);
  const refresh = client.fetchQuery(webSourceFaviconQueryOptions(client, source));
  expect(client.getQueryData(options.queryKey)).toBe(FALLBACK);
  image.resolve(true);
  expect(await refresh).toBe(PRIMARY);
  expect(cacheService.getPersist(CACHE_KEY)[SITE]).toEqual({ url: PRIMARY, resolvedAt: NOW + 1 });
});

test('a changed explicit favicon is eligible even with a fresh previous selection', async () => {
  cacheService.setPersist(CACHE_KEY, {
    [SITE]: { url: FALLBACK, resolvedAt: NOW, faviconUrl: `${SITE}/old.png` },
  });
  const client = createClient();
  const changed = { ...source, faviconUrl: `${SITE}/new.png` };
  const image = deferredImage();
  prefetch.mockReturnValueOnce(image.promise);
  const options = webSourceFaviconQueryOptions(client, changed);
  const refresh = client.fetchQuery(options);
  expect(client.getQueryData(options.queryKey)).toBe(FALLBACK);
  expect(prefetch).toHaveBeenCalledWith(changed.faviconUrl, 'memory-disk');
  image.resolve(true);
  expect(await refresh).toBe(changed.faviconUrl);
});

test('an unmounted source cannot overwrite a new selection when native prefetch finishes late', async () => {
  const client = createClient();
  const old = { ...source, faviconUrl: `${SITE}/old.png` };
  const changed = { ...source, faviconUrl: `${SITE}/new.png` };
  const image = deferredImage();
  prefetch.mockReturnValueOnce(image.promise);
  const oldOptions = webSourceFaviconQueryOptions(client, old);
  const observer = new QueryObserver(client, oldOptions);
  const unsubscribe = observer.subscribe(() => {});
  const nativeRequest = client.getQueryCache().find({
    queryKey: ['webSourceFaviconImage', old.faviconUrl],
    exact: true,
  })?.promise;
  unsubscribe();

  expect(await client.fetchQuery(webSourceFaviconQueryOptions(client, changed))).toBe(
    changed.faviconUrl,
  );
  image.resolve(true);
  await nativeRequest;
  await Promise.resolve();
  expect(cacheService.getPersist(CACHE_KEY)[SITE]?.url).toBe(changed.faviconUrl);
  expect(client.getQueryData(oldOptions.queryKey)).toBeUndefined();
});

test('a native display failure replaces a restored selection for all active readers', async () => {
  cacheService.setPersist(CACHE_KEY, { [SITE]: { url: PRIMARY, resolvedAt: NOW } });
  const client = createClient();
  const observer = new QueryObserver(client, webSourceFaviconQueryOptions(client, source));
  const second = new QueryObserver(
    client,
    webSourceFaviconQueryOptions(client, { url: `${SITE}/second` }),
  );
  const unsubscribe = observer.subscribe(() => {});
  const unsubscribeSecond = second.subscribe(() => {});
  expect(observer.getCurrentResult().data).toBe(PRIMARY);

  await rejectWebSourceFavicon(client, source, PRIMARY);
  expect(observer.getCurrentResult().data).toBe(FALLBACK);
  expect(second.getCurrentResult().data).toBe(FALLBACK);
  expect(cacheService.getPersist(CACHE_KEY)[SITE]?.url).toBe(FALLBACK);
  expect(prefetch).toHaveBeenCalledTimes(1);
  expect(prefetch).toHaveBeenCalledWith(FALLBACK, 'memory-disk');
  unsubscribe();
  unsubscribeSecond();
});

test('a missing cached image degrades to the initial without restarting failed requests', async () => {
  cacheService.setPersist(CACHE_KEY, { [SITE]: { url: PRIMARY, resolvedAt: NOW } });
  prefetch.mockResolvedValue(false);
  const client = createClient();
  const observer = new QueryObserver(client, webSourceFaviconQueryOptions(client, source));
  const unsubscribe = observer.subscribe(() => {});
  await rejectWebSourceFavicon(client, source, PRIMARY);
  expect(observer.getCurrentResult().data).toBeNull();
  expect(cacheService.getPersist(CACHE_KEY)).toEqual({});
  unsubscribe();

  expect(await client.fetchQuery(webSourceFaviconQueryOptions(client, source))).toBeNull();
  expect(prefetch).toHaveBeenCalledTimes(1);
});

test('concurrent different sites preserve both successful records', async () => {
  const client = createClient();
  const other = { url: 'https://news.example.com:8443/article' };
  const firstImage = deferredImage();
  const secondImage = deferredImage();
  prefetch.mockReturnValueOnce(firstImage.promise).mockReturnValueOnce(secondImage.promise);
  const first = client.fetchQuery(webSourceFaviconQueryOptions(client, source));
  const second = client.fetchQuery(webSourceFaviconQueryOptions(client, other));
  firstImage.resolve(true);
  await first;
  secondImage.resolve(true);
  await second;
  expect(cacheService.getPersist(CACHE_KEY)).toEqual({
    [SITE]: { url: PRIMARY, resolvedAt: NOW },
    'https://news.example.com:8443': {
      url: 'https://news.example.com:8443/favicon.ico',
      resolvedAt: NOW,
    },
  });
});

test.each([false, true])(
  'bounds persisted sites to 256, including timestamp ties (%s)',
  async (tie) => {
    cacheService.setPersist(
      CACHE_KEY,
      Object.fromEntries(
        Array.from({ length: 256 }, (_, index) => [
          `https://site-${index}.example`,
          {
            url: `https://site-${index}.example/favicon.ico`,
            resolvedAt: tie ? NOW : NOW - 256 + index,
          },
        ]),
      ),
    );
    const client = createClient();
    await client.fetchQuery(webSourceFaviconQueryOptions(client, source));
    const saved = cacheService.getPersist(CACHE_KEY);
    expect(Object.keys(saved)).toHaveLength(256);
    expect(saved[SITE]?.url).toBe(PRIMARY);
    if (!tie) expect(saved['https://site-0.example']).toBeUndefined();
  },
);
