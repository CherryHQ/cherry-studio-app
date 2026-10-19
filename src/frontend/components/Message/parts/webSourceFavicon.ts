import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { Image } from 'expo-image';

import { cacheService } from '@/frontend/data/CacheService';
import type { SiteFaviconCacheEntry } from '@/shared/data/cache/cacheSchemas';

import { getFaviconSiteKey, getFaviconUrls, type WebSource } from './webSource';

const CACHE_KEY = 'chat.site_favicons';
const FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_CACHED_SITES = 256;

type FaviconSource = Pick<WebSource, 'url' | 'faviconUrl'>;

/** Query owns shared work; the native image cache owns bytes and decoding. */
export function webSourceFaviconQueryOptions(client: QueryClient, source: FaviconSource) {
  const site = getFaviconSiteKey(source);
  const cached = site ? readCachedFavicon(site) : undefined;
  const explicitChanged = source.faviconUrl && source.faviconUrl !== cached?.faviconUrl;

  return queryOptions({
    // An explicit icon change starts a new source generation; article URLs do not.
    queryKey: ['webSourceFavicon', site, source.faviconUrl ?? null] as const,
    enabled: site !== undefined,
    initialData: cached?.url,
    initialDataUpdatedAt: explicitChanged ? 0 : cached?.resolvedAt,
    queryFn: async ({ signal }): Promise<string | null> => {
      if (!site) return null;

      const saved = readCachedFavicon(site);
      const preferSaved =
        saved &&
        Date.now() - saved.resolvedAt < FRESHNESS_MS &&
        (!source.faviconUrl || source.faviconUrl === saved.faviconUrl);
      const candidates = [
        ...(preferSaved ? [saved.url] : []),
        ...getFaviconUrls(source),
        ...(saved ? [saved.url] : []),
      ];

      for (const url of new Set(candidates)) {
        signal.throwIfAborted();
        const loaded = await client.fetchQuery(faviconImageQueryOptions(url)).catch(() => false);
        // Native prefetch cannot be cancelled. An obsolete query must not save its result.
        signal.throwIfAborted();
        if (!loaded) {
          removeCachedFavicon(site, url);
          continue;
        }

        saveCachedFavicon(site, {
          url,
          resolvedAt: Date.now(),
          ...(source.faviconUrl ? { faviconUrl: source.faviconUrl } : {}),
        });
        return url;
      }

      return null;
    },
    staleTime: (query) => (query.state.data === null ? FAILURE_COOLDOWN_MS : FRESHNESS_MS),
    gcTime: FAILURE_COOLDOWN_MS,
    networkMode: 'always',
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** A decoded/prefetched image can still fail in a view, or disappear from the native cache. */
export async function rejectWebSourceFavicon(
  client: QueryClient,
  source: FaviconSource,
  url: string,
): Promise<void> {
  const site = getFaviconSiteKey(source);
  if (!site) return;

  const imageKey = faviconImageQueryOptions(url).queryKey;
  // Cancel the query result, even though the underlying native request may finish later.
  void client.cancelQueries({ queryKey: imageKey, exact: true });
  client.setQueryData(imageKey, false);

  removeCachedFavicon(site, url);

  const affected = client
    .getQueryCache()
    .findAll({ queryKey: ['webSourceFavicon', site] })
    .filter((query) => query.state.data === url);

  await Promise.all(
    affected.map((query) => {
      client.setQueryData(query.queryKey, null);
      return client.invalidateQueries(
        { queryKey: query.queryKey, exact: true },
        { cancelRefetch: false },
      );
    }),
  );
}

function faviconImageQueryOptions(url: string) {
  return queryOptions({
    queryKey: ['webSourceFaviconImage', url] as const,
    queryFn: () => Image.prefetch(url, 'memory-disk').catch(() => false),
    // Recheck successful images through the native cache; only failures need a JS cooldown.
    staleTime: (query) => (query.state.data === false ? FAILURE_COOLDOWN_MS : 0),
    gcTime: FAILURE_COOLDOWN_MS,
    networkMode: 'always',
    retry: false,
  });
}

function readCachedFavicon(site: string): SiteFaviconCacheEntry | undefined {
  const entry = cacheService.getPersist(CACHE_KEY)[site];
  return isCachedFavicon(entry) ? entry : undefined;
}

function isCachedFavicon(entry: SiteFaviconCacheEntry | undefined): entry is SiteFaviconCacheEntry {
  return (
    !!entry &&
    typeof entry.url === 'string' &&
    getFaviconSiteKey({ url: entry.url }) !== undefined &&
    Number.isFinite(entry.resolvedAt) &&
    (entry.faviconUrl === undefined || typeof entry.faviconUrl === 'string')
  );
}

function saveCachedFavicon(site: string, entry: SiteFaviconCacheEntry) {
  // Read after the await so another site's completed lookup is never overwritten.
  const saved = { ...cacheService.getPersist(CACHE_KEY) };
  delete saved[site];
  // The new selection wins ties when several cached loads finish in the same millisecond.
  const newest = Object.entries({ [site]: entry, ...saved })
    .filter(([, value]) => isCachedFavicon(value))
    .sort(([, left], [, right]) => right.resolvedAt - left.resolvedAt)
    .slice(0, MAX_CACHED_SITES);
  cacheService.setPersist(CACHE_KEY, Object.fromEntries(newest));
}

function removeCachedFavicon(site: string, url: string) {
  const saved = cacheService.getPersist(CACHE_KEY);
  if (saved[site]?.url !== url) return;
  const next = { ...saved };
  delete next[site];
  cacheService.setPersist(CACHE_KEY, next);
}
