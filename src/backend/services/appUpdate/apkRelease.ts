import { z } from 'zod';

import { createHttpClient, HttpError } from '@/backend/services/http';
import type { ApkUpdateRelease, AppUpdateResult } from '@/shared/contracts/appUpdate';

import { normalizeReleaseNotes } from './releaseNotes';
import { compareReleaseVersions } from './releaseVersion';

const REPOSITORY = 'CherryHQ/cherry-studio-app';
export type ApkReleaseSource = 'gitcode' | 'github';
const ReleaseSchema = z.object({
  tag_name: z.string().regex(/^v?\d+\.\d+\.\d+$/),
  prerelease: z.boolean(),
  release_status: z.string().optional(),
  draft: z.boolean().optional(),
  body: z.string().nullish(),
  assets: z.array(
    z.object({ name: z.string(), type: z.string().optional(), browser_download_url: z.string() }),
  ),
});
const sources = {
  gitcode: {
    api: createHttpClient({
      baseUrl: 'https://api.gitcode.com/api/v5',
      headers: { Accept: 'application/json' },
      timeoutMs: 10_000,
    }),
    attachments: createHttpClient({ baseUrl: 'https://gitcode.com', timeoutMs: 15_000 }),
    origin: 'https://gitcode.com',
  },
  github: {
    api: createHttpClient({
      baseUrl: 'https://api.github.com',
      headers: { Accept: 'application/vnd.github+json' },
      timeoutMs: 10_000,
    }),
    attachments: createHttpClient({ baseUrl: 'https://github.com', timeoutMs: 15_000 }),
    origin: 'https://github.com',
  },
} as const;

export async function checkApkRelease(
  currentVersion: string,
  source: ApkReleaseSource,
  signal?: AbortSignal,
): Promise<AppUpdateResult> {
  let data: unknown;
  try {
    const response = await sources[source].api.request<unknown>({
      method: 'GET',
      path: `/repos/${REPOSITORY}/releases/latest`,
      ...(source === 'gitcode' ? { query: { type: 'latest' } } : {}),
      maxResponseBytes: 512_000,
      signal,
    });
    data = response.data;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404)
      return { status: 'unavailable', reason: 'noRelease' };
    throw error;
  }
  const release = ReleaseSchema.parse(data);
  const latestVersion = release.tag_name.replace(/^v/, '');
  const urls = apkReleaseUrls(release.tag_name, source);
  const hasAttachment = (name: string, url: string) =>
    release.assets.some(
      (asset) =>
        asset.name === name &&
        (source !== 'gitcode' || asset.type === 'attach') &&
        asset.browser_download_url === url,
    );
  if (
    release.prerelease ||
    (source === 'gitcode' ? release.release_status !== 'latest' : release.draft !== false) ||
    !hasAttachment(`cherry-studio-${latestVersion}-android.apk`, urls.downloadUrl) ||
    !hasAttachment('SHA256SUMS', urls.checksumUrl)
  ) {
    return { status: 'unavailable', reason: 'noRelease' };
  }
  return compareReleaseVersions(latestVersion, currentVersion) > 0
    ? {
        status: 'available',
        channel: 'apk',
        id: `apk:${latestVersion}`,
        currentVersion,
        latestVersion,
        notes: normalizeReleaseNotes(release.body),
        ...urls,
      }
    : { status: 'upToDate', currentVersion };
}

export function assertApkRelease(release: ApkUpdateRelease, currentVersion: string): void {
  getApkReleaseSource(release);
  if (compareReleaseVersions(release.latestVersion, currentVersion) <= 0)
    throw new Error('Invalid APK release');
}

function getApkReleaseSource(release: ApkUpdateRelease): ApkReleaseSource {
  const tag =
    /^https:\/\/(?:gitcode\.com|github\.com)\/CherryHQ\/cherry-studio-app\/releases\/download\/(v?\d+\.\d+\.\d+)\//.exec(
      release.downloadUrl,
    )?.[1];
  if (!tag) throw new Error('Invalid APK download URL');
  const source = new URL(release.downloadUrl).hostname === 'gitcode.com' ? 'gitcode' : 'github';
  const urls = apkReleaseUrls(tag, source);
  const version = tag.replace(/^v/, '');
  if (
    release.downloadUrl !== urls.downloadUrl ||
    release.checksumUrl !== urls.checksumUrl ||
    release.latestVersion !== version ||
    release.id !== `apk:${version}`
  )
    throw new Error('Invalid APK release');
  return source;
}

export async function readApkChecksum(
  release: ApkUpdateRelease,
  signal: AbortSignal,
): Promise<string> {
  const source = getApkReleaseSource(release);
  const { data } = await sources[source].attachments.request<string>({
    method: 'GET',
    path: new URL(release.checksumUrl).pathname,
    responseType: 'text',
    maxResponseBytes: 16_384,
    signal,
  });
  const filename = `cherry-studio-${release.latestVersion}-android.apk`;
  const matches = data.split(/\r?\n/).flatMap((line) => {
    const match = /^([a-fA-F0-9]{64}) [ *](\S+)$/.exec(line);
    return match?.[2] === filename ? [match[1]!.toLowerCase()] : [];
  });
  if (matches.length !== 1) throw new Error('Missing or ambiguous APK checksum');
  return matches[0]!;
}

function apkReleaseUrls(tag: string, source: ApkReleaseSource) {
  const base = `${sources[source].origin}/${REPOSITORY}/releases/download/${tag}`;
  return {
    downloadUrl: `${base}/cherry-studio-${tag.replace(/^v/, '')}-android.apk`,
    checksumUrl: `${base}/SHA256SUMS`,
  };
}
