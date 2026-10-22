import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

import type { ApkUpdateRelease } from '@/shared/contracts/appUpdate';

import { createAppUpdateModule } from '../createAppUpdateModule';
import { runningUpdate } from '../runningUpdate';

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.9.0',
  nativeBuildVersion: '19',
  applicationId: 'com.example.app',
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '9.0.0', extra: { isApkUpdatesEnabled: true } } },
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ regionCode: 'CN' }] }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' }, Linking: { openURL: jest.fn() } }));
jest.mock('../runningUpdate', () => ({ runningUpdate: { channel: 'production-apk' } }));
const mockNative = {
  isApkInstallationEnabled: jest.fn(() => true),
  installApk: jest.fn(async () => 'opened'),
  checkPlayUpdate: jest.fn(async () => ({ available: true, versionCode: 20 })),
};
const mockGetNative = jest.fn(() => mockNative as typeof mockNative | null);
jest.mock('../../../../../modules/app-update', () => ({
  getNativeAppUpdate: () => mockGetNative(),
}));
const mockDownload = {
  download: jest.fn(async () => {}),
  cancelDownload: jest.fn(async () => {}),
  getDownload: jest.fn(() => ({ status: 'idle' })),
  subscribeDownload: jest.fn(),
  dispose: jest.fn(async () => {}),
  invalidateReady: jest.fn(),
};
jest.mock('../createApkDownload', () => ({ createApkDownload: () => mockDownload }));
const mockCheckApk = jest.fn();
const mockAssertApk = jest.fn();
const mockCheckAppStore = jest.fn();
jest.mock('../gitcodeRelease', () => ({
  checkGitcodeRelease: (...args: unknown[]) => mockCheckApk(...args),
  assertApkRelease: (...args: unknown[]) => mockAssertApk(...args),
}));
jest.mock('../appStoreRelease', () => ({
  checkAppStoreRelease: (...args: unknown[]) => mockCheckAppStore(...args),
}));
const mockPermission = jest.fn(async () => true);
const create = () => createAppUpdateModule({ requestInstallPermission: mockPermission });
const apk: ApkUpdateRelease = {
  channel: 'apk',
  id: 'apk:1.10.0',
  currentVersion: '1.9.0',
  latestVersion: '1.10.0',
  downloadUrl:
    'https://gitcode.com/CherryHQ/cherry-studio-app/releases/download/v1.10.0/cherry-studio-1.10.0-android.apk',
  checksumUrl:
    'https://gitcode.com/CherryHQ/cherry-studio-app/releases/download/v1.10.0/SHA256SUMS',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetNative.mockReturnValue(mockNative);
  mockNative.isApkInstallationEnabled.mockReturnValue(true);
  mockNative.checkPlayUpdate.mockResolvedValue({ available: true, versionCode: 20 });
  mockCheckApk.mockResolvedValue({ status: 'available', ...apk });
  mockDownload.getDownload.mockReturnValue({ status: 'idle' });
  jest.mocked(Linking.openURL).mockResolvedValue(undefined);
  jest.replaceProperty(globalThis, '__DEV__', false);
});
afterEach(() => jest.restoreAllMocks());

test('checks the installed version, forwards cancellation, and never downloads on discovery', async () => {
  const signal = new AbortController().signal;
  await expect(create().check(signal)).resolves.toEqual({ status: 'available', ...apk });
  expect(mockCheckApk).toHaveBeenCalledWith('1.9.0', signal);
  expect(mockDownload.download).not.toHaveBeenCalled();
  expect(Linking.openURL).not.toHaveBeenCalled();
});

test('missing or malformed installed versions cannot produce an update decision', async () => {
  jest.replaceProperty(Application, 'nativeApplicationVersion', null);
  await expect(create().check()).resolves.toEqual({
    status: 'unavailable',
    reason: 'unknownVersion',
  });
  jest.replaceProperty(Application, 'nativeApplicationVersion', 'unknown');
  await expect(create().check()).rejects.toThrow('Invalid release version');
  expect(mockCheckApk).not.toHaveBeenCalled();
});

test.each(['preview', null, 'production-ios'])(
  'unconfigured Android channel %s stays disabled despite an OTA flag',
  async (channel) => {
    jest.replaceProperty(runningUpdate, 'channel', channel);
    const updates = create();
    expect(updates.isEnabled).toBe(false);
    await expect(updates.check()).resolves.toEqual({
      status: 'unavailable',
      reason: 'unsupported',
    });
    await expect(updates.download(apk)).rejects.toThrow('disabled');
    await expect(updates.install()).rejects.toThrow('disabled');
    await expect(updates.requestInstallPermission()).rejects.toThrow('disabled');
    expect(mockCheckApk).not.toHaveBeenCalled();
  },
);

test('the native Play channel ignores an enabled APK flag and cannot download or install APKs', async () => {
  jest.replaceProperty(runningUpdate, 'channel', 'production-google-play');
  const updates = create();
  const result = await updates.check();
  expect(result).toMatchObject({
    status: 'available',
    channel: 'google-play',
    id: 'google-play:20',
    latestVersion: null,
  });
  expect(mockCheckApk).not.toHaveBeenCalled();
  await expect(updates.download(apk)).rejects.toThrow('disabled');
  await expect(updates.install()).rejects.toThrow('disabled');
  await expect(updates.requestInstallPermission()).rejects.toThrow('disabled');
  if (result.status !== 'available') throw new Error('Expected store release');
  jest.mocked(Linking.openURL).mockRejectedValueOnce(new Error('No store handler'));
  await updates.openStore(result);
  expect(Linking.openURL).toHaveBeenNthCalledWith(1, 'market://details?id=com.example.app');
  expect(Linking.openURL).toHaveBeenNthCalledWith(
    2,
    'https://play.google.com/store/apps/details?id=com.example.app',
  );
});

test('Play check failure remains an error and a missing native module is not up-to-date', async () => {
  jest.replaceProperty(runningUpdate, 'channel', 'production-google-play');
  mockNative.checkPlayUpdate.mockRejectedValueOnce(new Error('Store unavailable'));
  await expect(create().check()).rejects.toThrow('Store unavailable');
  mockGetNative.mockReturnValue(null);
  await expect(create().check()).resolves.toEqual({
    status: 'unavailable',
    reason: 'nativeUnavailable',
  });
});

test('Play uses build numbers and does not infer a version name', async () => {
  jest.replaceProperty(runningUpdate, 'channel', 'production-google-play');
  mockNative.checkPlayUpdate.mockResolvedValue({ available: false, versionCode: 0 });
  await expect(create().check()).resolves.toEqual({ status: 'upToDate', currentVersion: '1.9.0' });
  mockNative.checkPlayUpdate.mockResolvedValue({ available: true, versionCode: 19 });
  await expect(create().check()).rejects.toThrow('Invalid Google Play update version');
});

test('iOS reads published store metadata and cannot invoke APK operations', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest.replaceProperty(runningUpdate, 'channel', 'production-ios');
  mockCheckAppStore.mockResolvedValue({ status: 'upToDate', currentVersion: '1.9.0' });
  const updates = create();
  await updates.check();
  expect(mockCheckAppStore).toHaveBeenCalledWith('com.example.app', '1.9.0', 'CN', undefined);
  expect(mockCheckApk).not.toHaveBeenCalled();
  await expect(updates.download(apk)).rejects.toThrow('disabled');
});

test('development requires an explicit flag and never overrides another native channel', () => {
  jest.replaceProperty(globalThis, '__DEV__', true);
  jest.replaceProperty(runningUpdate, 'channel', null);
  expect(create().channel).toBe('apk');
  jest.replaceProperty(Constants.expoConfig!, 'extra', { isApkUpdatesEnabled: false });
  expect(create().channel).toBeNull();
});

test('native installation capability and verified readiness are required independently', async () => {
  const updates = create();
  mockNative.isApkInstallationEnabled.mockReturnValue(false);
  await expect(updates.download(apk)).rejects.toThrow('native module');
  mockNative.isApkInstallationEnabled.mockReturnValue(true);
  await expect(updates.install()).rejects.toThrow('No verified APK');
  await updates.download(apk);
  expect(mockAssertApk).toHaveBeenCalledWith(apk, '1.9.0');
  expect(mockDownload.download).toHaveBeenCalledWith(apk);
  expect(mockNative.installApk).not.toHaveBeenCalled();
  mockDownload.getDownload.mockReturnValue({ status: 'ready' });
  await expect(updates.install()).resolves.toBe('opened');
});

test('disposal joins the transfer and rejects further actions', async () => {
  const updates = create();
  await updates.dispose();
  expect(mockDownload.dispose).toHaveBeenCalledTimes(1);
  await expect(updates.download(apk)).rejects.toThrow('disabled');
  await expect(updates.check()).resolves.toMatchObject({ status: 'unavailable' });
});

test('an evicted or incompatible APK leaves readiness so the user can download again', async () => {
  mockDownload.getDownload.mockReturnValue({ status: 'ready' });
  mockNative.installApk.mockResolvedValueOnce('invalidPackage');
  await expect(create().install()).resolves.toBe('invalidPackage');
  expect(mockDownload.invalidateReady).toHaveBeenCalledTimes(1);
});

test('a cached store result can still open after backend recreation, but cannot redirect elsewhere', async () => {
  jest.replaceProperty(runningUpdate, 'channel', 'production-google-play');
  const result = await create().check();
  if (result.status !== 'available' || result.channel === 'apk')
    throw new Error('Expected store release');
  const recreated = create();
  await recreated.openStore(result);
  await expect(
    recreated.openStore({ ...result, storeUrl: 'https://example.com/app.apk' }),
  ).rejects.toThrow('Invalid');
});
