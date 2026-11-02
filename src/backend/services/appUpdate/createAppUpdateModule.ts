import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { getLocales } from 'expo-localization';
import { Linking, Platform } from 'react-native';

import type { AppUpdateModule, AppUpdateResult } from '@/shared/contracts/appUpdate';

import { getNativeAppUpdate } from '../../../../modules/app-update';
import { checkAppStoreRelease } from './appStoreRelease';
import { resolveAppUpdateChannel } from './appUpdateChannel';
import { createApkDownload } from './createApkDownload';
import { checkDomesticStoreRelease } from './domesticStoreRelease';
import { assertApkRelease, checkGitcodeRelease } from './gitcodeRelease';
import { readReleaseNotes } from './releaseNotes';
import { parseReleaseVersion } from './releaseVersion';
import { runningUpdate } from './runningUpdate';

export function createAppUpdateModule(dependencies: {
  requestInstallPermission: () => Promise<boolean>;
}): AppUpdateModule & { dispose(): Promise<void> } {
  const channel = resolveAppUpdateChannel(
    Platform.OS,
    runningUpdate.channel,
    __DEV__ && Constants.expoConfig?.extra?.isApkUpdatesEnabled === true,
  );
  const download = createApkDownload();
  const stores =
    channel === 'domestic-stores' ? getNativeAppUpdate()?.getDomesticStoreInfo?.() : null;
  const store = stores?.preferred ?? (stores?.available.length === 1 ? stores.available[0]! : null);
  let stopped = false;
  let installation: ReturnType<AppUpdateModule['install']> | undefined;

  function requireApk() {
    if (stopped || channel !== 'apk')
      throw new Error('APK updates are disabled for this distribution');
    const native = getNativeAppUpdate();
    if (!native?.isApkInstallationEnabled())
      throw new Error('APK installation native module is unavailable');
    return native;
  }

  return {
    channel,
    store,
    isEnabled: channel !== null,
    async check(signal): Promise<AppUpdateResult> {
      signal?.throwIfAborted();
      if (stopped || !channel) return { status: 'unavailable', reason: 'unsupported' };
      const currentVersion = Application.nativeApplicationVersion?.trim();
      if (!currentVersion) return { status: 'unavailable', reason: 'unknownVersion' };
      parseReleaseVersion(currentVersion);
      if (channel === 'apk') {
        if (!getNativeAppUpdate()?.isApkInstallationEnabled()) {
          return { status: 'unavailable', reason: 'nativeUnavailable' };
        }
        const result = await checkGitcodeRelease(currentVersion, signal);
        signal?.throwIfAborted();
        download.clearObsoleteFailure(result.status === 'available' ? result.id : null);
        return result;
      }
      if (!Application.applicationId) return { status: 'unavailable', reason: 'unknownVersion' };
      if (channel === 'domestic-stores') {
        if (!stores) return { status: 'unavailable', reason: 'nativeUnavailable' };
        const fallback: AppUpdateResult = { status: 'storeOnly', stores: stores.available };
        if (!store || !stores.available.includes(store)) return fallback;
        const currentBuild = Number(Application.nativeBuildVersion);
        if (!Number.isSafeInteger(currentBuild) || currentBuild <= 0) return fallback;
        try {
          return await checkDomesticStoreRelease(
            store,
            Application.applicationId,
            currentVersion,
            currentBuild,
            signal,
          );
        } catch {
          signal?.throwIfAborted();
          // Unknown availability offers a manual visit, never an "up to date" assertion.
          return fallback;
        }
      }
      if (channel === 'google-play') {
        const native = getNativeAppUpdate();
        if (!native) return { status: 'unavailable', reason: 'nativeUnavailable' };
        const update = await native.checkPlayUpdate();
        signal?.throwIfAborted();
        if (!update.available) return { status: 'upToDate', currentVersion };
        const currentBuild = Number(Application.nativeBuildVersion);
        if (!Number.isSafeInteger(currentBuild) || currentBuild <= 0) {
          return { status: 'unavailable', reason: 'unknownVersion' };
        }
        if (!Number.isSafeInteger(update.versionCode) || update.versionCode <= currentBuild) {
          throw new Error('Invalid Google Play update version');
        }
        return {
          status: 'available',
          channel,
          id: `google-play:${update.versionCode}`,
          currentVersion,
          latestVersion: null,
          notes: null,
          storeUrl: `https://play.google.com/store/apps/details?id=${Application.applicationId}`,
        };
      }
      const region = getLocales()[0]?.regionCode;
      const country = region && /^[A-Z]{2}$/.test(region) ? region : 'US';
      return checkAppStoreRelease(Application.applicationId, currentVersion, country, signal);
    },
    async openStore(release) {
      if (stopped || release.channel === 'apk' || release.channel !== channel) {
        throw new Error('Invalid store update action');
      }
      if (release.channel === 'domestic-stores') {
        const native = getNativeAppUpdate();
        if (!native?.getDomesticStoreInfo?.().available.includes(release.store)) {
          throw new Error('The requested domestic store is unavailable');
        }
        await native.openDomesticStore(release.store);
        return;
      }
      if (channel === 'google-play') {
        if (
          !Application.applicationId ||
          release.storeUrl !==
            `https://play.google.com/store/apps/details?id=${Application.applicationId}`
        ) {
          throw new Error('Invalid Google Play URL');
        }
        try {
          await Linking.openURL(`market://details?id=${Application.applicationId}`);
          return;
        } catch {
          /* Fall back to the official web listing when no market handler is available. */
        }
      } else {
        const match = /^app-store:(\d+):/.exec(release.id);
        if (
          !match ||
          !/^https:\/\/apps\.apple\.com\/[a-z]{2}\/app\/id\d+$/.test(release.storeUrl) ||
          !release.storeUrl.endsWith(`/id${match[1]}`)
        )
          throw new Error('Invalid App Store URL');
      }
      await Linking.openURL(release.storeUrl);
    },
    async download(release) {
      requireApk();
      assertApkRelease(release, Application.nativeApplicationVersion?.trim() ?? '');
      await download.download(release);
    },
    releaseNotes: readReleaseNotes,
    cancelDownload: download.cancelDownload,
    getDownload: download.getDownload,
    subscribeDownload: download.subscribeDownload,
    async install() {
      const native = requireApk();
      if (installation) return installation;
      if (download.getDownload().status !== 'ready') throw new Error('No verified APK is ready');
      installation = native
        .installApk()
        .then((result) => {
          if (result === 'invalidPackage') download.invalidateReady();
          return result;
        })
        .finally(() => {
          installation = undefined;
        });
      return installation;
    },
    async requestInstallPermission() {
      requireApk();
      return dependencies.requestInstallPermission();
    },
    async dispose() {
      stopped = true;
      await download.dispose();
      await installation?.catch(() => {});
    },
  };
}
