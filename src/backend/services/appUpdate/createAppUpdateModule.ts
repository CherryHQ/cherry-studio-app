import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';
import { z } from 'zod';

import { createHttpClient, HttpError } from '@/backend/services/http';
import type { AppUpdateModule, AppUpdateResult } from '@/shared/contracts/appUpdate';

import { compareReleaseVersions, parseReleaseVersion } from './releaseVersion';

const REPOSITORY = 'CherryHQ/cherry-studio-app';
const ReleaseSchema = z.object({
  tag_name: z.string().regex(/^v?\d+\.\d+\.\d+$/),
  prerelease: z.boolean(),
  release_status: z.string(),
  assets: z.array(
    z.object({ name: z.string(), type: z.string(), browser_download_url: z.string() }),
  ),
});

export function createAppUpdateModule(): AppUpdateModule {
  const isEnabled =
    Platform.OS === 'android' && Constants.expoConfig?.extra?.isApkUpdatesEnabled === true;
  const gitcode = createHttpClient({
    baseUrl: 'https://api.gitcode.com/api/v5',
    headers: { Accept: 'application/json' },
    timeoutMs: 10_000,
  });

  return {
    isEnabled,
    async check(signal): Promise<AppUpdateResult> {
      if (!isEnabled) return { status: 'unavailable', reason: 'unsupported' };
      const currentVersion = Constants.expoConfig?.version?.trim();
      if (!currentVersion) return { status: 'unavailable', reason: 'unknownVersion' };
      // Reject an unparseable installed version before the request; never infer "up to date" from bad data.
      parseReleaseVersion(currentVersion);
      let data: unknown;
      try {
        const response = await gitcode.request<unknown>({
          method: 'GET',
          path: `/repos/${REPOSITORY}/releases/latest`,
          query: { type: 'latest' },
          maxResponseBytes: 512_000,
          signal,
        });
        data = response.data;
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) {
          return { status: 'unavailable', reason: 'noRelease' };
        }
        throw error;
      }
      const release = ReleaseSchema.parse(data);
      const latestVersion = release.tag_name.replace(/^v/, '');
      const apkName = `cherry-studio-${latestVersion}-android.apk`;
      const downloadUrl = apkDownloadUrl(release.tag_name);
      const hasApk = release.assets.some(
        (asset) =>
          asset.name === apkName &&
          asset.type === 'attach' &&
          asset.browser_download_url === downloadUrl,
      );
      if (release.prerelease || release.release_status !== 'latest' || !hasApk) {
        return { status: 'unavailable', reason: 'noRelease' };
      }
      return compareReleaseVersions(latestVersion, currentVersion) > 0
        ? {
            status: 'available',
            currentVersion,
            latestVersion,
            downloadUrl,
          }
        : { status: 'upToDate', currentVersion };
    },
    async openDownload(downloadUrl) {
      if (!isEnabled) throw new Error('APK updates are disabled for this distribution');
      const tag =
        /^https:\/\/gitcode\.com\/CherryHQ\/cherry-studio-app\/releases\/download\/(v?\d+\.\d+\.\d+)\//.exec(
          downloadUrl,
        )?.[1];
      if (!tag || downloadUrl !== apkDownloadUrl(tag)) throw new Error('Invalid APK download URL');
      // The system browser owns the download; the app requests no package-install permission.
      await Linking.openURL(downloadUrl);
    },
  };
}

function apkDownloadUrl(tag: string): string {
  return `https://gitcode.com/${REPOSITORY}/releases/download/${tag}/cherry-studio-${tag.replace(/^v/, '')}-android.apk`;
}
