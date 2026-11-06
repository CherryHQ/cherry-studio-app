import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { getLocales } from 'expo-localization';
import { Linking, Platform } from 'react-native';

import { linkAbortSignals } from '@/backend/utils/linkAbortSignals';
import type {
  AppUpdateModule,
  AppUpdateResult,
  DomesticAppStore,
} from '@/shared/contracts/appUpdate';

import type { NativeAppUpdate } from '../../../../modules/app-update';
import { getNativeAppUpdate } from '../../../../modules/app-update';
import { checkAppStoreRelease } from './appStoreRelease';
import { resolveAppUpdateChannel } from './appUpdateChannel';
import { createApkDownload } from './createApkDownload';
import { assertApkRelease, checkGitcodeRelease } from './gitcodeRelease';
import { checkNativeDomesticStoreRelease } from './nativeDomesticStoreRelease';
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
  const lifetime = new AbortController();
  const readStores = () =>
    channel === 'domestic-stores' ? getNativeAppUpdate()?.getDomesticStoreInfo?.() : null;
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
        const store = resolveDomesticStore(readStores());
        if (!store) return { status: 'unavailable', reason: 'nativeUnavailable' };
        const linked = linkAbortSignals(signal ? [lifetime.signal, signal] : [lifetime.signal]);
        try {
          let result: AppUpdateResult;
          if (store === 'oppo') {
            const release = await checkGitcodeRelease(currentVersion, linked.signal);
            result =
              release.status === 'available'
                ? {
                    status: 'available',
                    channel,
                    store,
                    id: `domestic-stores:${store}:${release.id}`,
                    currentVersion,
                    latestVersion: release.latestVersion,
                    notes: release.notes,
                    versionCode: null,
                  }
                : release;
          } else {
            const currentBuild = Number(Application.nativeBuildVersion);
            if (!Number.isSafeInteger(currentBuild) || currentBuild <= 0)
              return { status: 'unavailable', reason: 'unknownVersion' };
            result = await checkNativeDomesticStoreRelease(
              store,
              Application.applicationId,
              currentVersion,
              currentBuild,
              linked.signal,
            );
          }
          linked.signal.throwIfAborted();
          if (resolveDomesticStore(readStores()) !== store)
            return { status: 'unavailable', reason: 'nativeUnavailable' };
          return result;
        } finally {
          linked.dispose();
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
        if (!native || resolveDomesticStore(native.getDomesticStoreInfo?.()) !== release.store) {
          throw new Error('The requested domestic store is unavailable');
        }
        await native.openDomesticStore(release.store, release.grayApkId ?? null);
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
      lifetime.abort();
      await download.dispose();
      await installation?.catch(() => {});
    },
  };
}

const DEVICE_STORES: Partial<Record<string, DomesticAppStore>> = {
  honor: 'honor',
  xiaomi: 'xiaomi',
  redmi: 'xiaomi',
  poco: 'xiaomi',
  oppo: 'oppo',
  realme: 'oppo',
  oneplus: 'oppo',
  vivo: 'vivo',
  iqoo: 'vivo',
};

function resolveDomesticStore(
  info: ReturnType<NativeAppUpdate['getDomesticStoreInfo']> | null | undefined,
): DomesticAppStore | null {
  if (!info) return null;
  if (info.preferred && info.available.includes(info.preferred)) return info.preferred;
  for (const identity of [info.brand, info.manufacturer]) {
    const candidate = DEVICE_STORES[identity.trim().toLowerCase()];
    if (candidate && info.available.includes(candidate)) return candidate;
  }
  return info.available.length === 1 ? info.available[0]! : null;
}
