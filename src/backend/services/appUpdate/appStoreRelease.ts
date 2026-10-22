import { z } from 'zod';

import { createHttpClient } from '@/backend/services/http';
import type { AppUpdateResult } from '@/shared/contracts/appUpdate';

import { compareReleaseVersions } from './releaseVersion';

const LookupSchema = z.object({
  results: z.array(
    z.object({ bundleId: z.string(), trackId: z.number().int().positive(), version: z.string() }),
  ),
});
const apple = createHttpClient({ baseUrl: 'https://itunes.apple.com', timeoutMs: 10_000 });

/** APK releases and TestFlight uploads are not App Store availability signals. */
export async function checkAppStoreRelease(
  bundleId: string,
  currentVersion: string,
  country: string,
  signal?: AbortSignal,
): Promise<AppUpdateResult> {
  const { data } = await apple.request<unknown>({
    method: 'GET',
    path: '/lookup',
    query: { bundleId, country },
    maxResponseBytes: 512_000,
    signal,
  });
  const release = LookupSchema.parse(data).results.find((entry) => entry.bundleId === bundleId);
  if (!release) return { status: 'unavailable', reason: 'noRelease' };
  return compareReleaseVersions(release.version, currentVersion) > 0
    ? {
        status: 'available',
        channel: 'app-store',
        id: `app-store:${release.trackId}:${release.version}`,
        currentVersion,
        latestVersion: release.version,
        storeUrl: `https://apps.apple.com/${country.toLowerCase()}/app/id${release.trackId}`,
      }
    : { status: 'upToDate', currentVersion };
}
