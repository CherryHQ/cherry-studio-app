import { z } from 'zod';

import { createHttpClient } from '@/backend/services/http';
import type { AppUpdateResult, DomesticAppStore } from '@/shared/contracts/appUpdate';

const PublishedStoreSchema = z.object({
  status: z.literal('published'),
  // A global manifest cannot establish device-specific or staged-rollout eligibility.
  rollout: z.literal('all-supported-devices'),
  versionCode: z.number().int().positive().max(2_100_000_000),
  versionName: z.string().trim().min(1).max(100).nullable(),
  notes: z.string().max(32_000).nullable(),
});
const StoreSchema = z.intersection(
  z.object({ checkedAt: z.iso.datetime(), expiresAt: z.iso.datetime() }),
  z.discriminatedUnion('status', [
    PublishedStoreSchema,
    z.object({ status: z.literal('unpublished') }),
    z.object({ status: z.literal('unknown') }),
  ]),
);
const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  packageName: z.string(),
  stores: z.record(z.string(), z.unknown()),
});

/** Reads public, credential-free metadata; vendor authentication never runs on the phone. */
export async function checkDomesticStoreRelease(
  store: DomesticAppStore,
  packageName: string,
  currentVersion: string,
  currentBuild: number,
  signal?: AbortSignal,
): Promise<AppUpdateResult> {
  signal?.throwIfAborted();
  const endpoint = process.env.EXPO_PUBLIC_DOMESTIC_STORE_VERSIONS_URL?.trim();
  if (!endpoint) return { status: 'storeOnly', stores: [store] };
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Domestic store metadata requires a public HTTPS URL without credentials');
  }
  const client = createHttpClient({
    baseUrl: url.origin,
    timeoutMs: 10_000,
    headers: { Accept: 'application/json' },
  });
  const { data } = await client.request<unknown>({
    method: 'GET',
    path: url.pathname,
    maxResponseBytes: 256_000,
    signal,
  });
  signal?.throwIfAborted();
  const manifest = ManifestSchema.parse(data);
  if (manifest.packageName !== packageName) throw new Error('Store metadata package mismatch');
  const record = manifest.stores[store];
  if (!record) return { status: 'storeOnly', stores: [store] };
  const entry = StoreSchema.parse(record);
  const now = Date.now();
  const checkedAt = Date.parse(entry.checkedAt);
  const expiresAt = Date.parse(entry.expiresAt);
  if (
    checkedAt > now + 5 * 60_000 ||
    expiresAt <= now ||
    expiresAt <= checkedAt ||
    expiresAt - checkedAt > 24 * 60 * 60_000 ||
    entry.status !== 'published'
  ) {
    return { status: 'storeOnly', stores: [store] };
  }
  return entry.versionCode > currentBuild
    ? {
        status: 'available',
        channel: 'domestic-stores',
        store,
        id: `domestic-stores:${store}:${entry.versionCode}`,
        currentVersion,
        latestVersion: entry.versionName,
        versionCode: entry.versionCode,
        expiresAt,
        notes: entry.notes,
      }
    : { status: 'upToDate', currentVersion };
}
