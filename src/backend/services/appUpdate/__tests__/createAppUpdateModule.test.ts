import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

import { HttpError } from '@/backend/services/http';

import { createAppUpdateModule } from '../createAppUpdateModule';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.9.0', extra: { isApkUpdatesEnabled: true } } },
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  Linking: { openURL: jest.fn() },
}));
const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  ...jest.requireActual('@/backend/services/http'),
  createHttpClient: () => ({ request: mockRequest }),
}));

const downloadUrl =
  'https://gitcode.com/CherryHQ/cherry-studio-app/releases/download/v1.10.0/cherry-studio-1.10.0-android.apk';
const apk = {
  name: 'cherry-studio-1.10.0-android.apk',
  type: 'attach',
  browser_download_url: downloadUrl,
};
const release = {
  tag_name: 'v1.10.0',
  prerelease: false,
  release_status: 'latest',
  assets: [
    {
      name: 'cherry-studio-app-v1.10.0.zip',
      type: 'source',
      browser_download_url: 'https://gitcode.com/CherryHQ/cherry-studio-app/-/archive/v1.10.0.zip',
    },
    apk,
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRequest.mockResolvedValue({ data: release });
  jest.mocked(Linking.openURL).mockResolvedValue(undefined);
});

afterEach(() => jest.restoreAllMocks());

test('selects the latest GitCode APK attachment and forwards cancellation', async () => {
  const signal = new AbortController().signal;
  const updates = createAppUpdateModule();
  expect(updates.isEnabled).toBe(true);
  await expect(updates.check(signal)).resolves.toEqual({
    status: 'available',
    currentVersion: '1.9.0',
    latestVersion: '1.10.0',
    downloadUrl,
  });
  expect(mockRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'GET',
      path: '/repos/CherryHQ/cherry-studio-app/releases/latest',
      query: { type: 'latest' },
      signal,
    }),
  );
  expect(Linking.openURL).not.toHaveBeenCalled();
});

test.each(['1.10.0', '2.0.0'])(
  'equal/newer installed versions never prompt a downgrade: %s',
  async (version) => {
    jest.replaceProperty(Constants.expoConfig!, 'version', version);
    await expect(createAppUpdateModule().check()).resolves.toEqual({
      status: 'upToDate',
      currentVersion: version,
    });
  },
);

test.each([
  { assets: [] },
  { assets: [{ ...apk, name: 'cherry-studio-1.10.0-android.aab' }] },
  { assets: [{ ...apk, name: 'cherry-studio-1.9.0-android.apk' }] },
  { assets: [{ ...apk, type: 'source' }] },
  { assets: [{ ...apk, browser_download_url: 'https://unrelated.example/app.apk' }] },
  { assets: [{ ...apk, browser_download_url: downloadUrl.replace('/v1.10.0/', '/v1.9.0/') }] },
  { prerelease: true },
  { release_status: 'pre' },
  { release_status: 'draft' },
])('does not advertise a release without a stable APK attachment: %j', async (overrides) => {
  mockRequest.mockResolvedValue({ data: { ...release, ...overrides } });
  await expect(createAppUpdateModule().check()).resolves.toEqual({
    status: 'unavailable',
    reason: 'noRelease',
  });
});

test('a tag without v still matches the published APK and destination', async () => {
  const url = downloadUrl.replace('/v1.10.0/', '/1.10.0/');
  mockRequest.mockResolvedValue({
    data: { ...release, tag_name: '1.10.0', assets: [{ ...apk, browser_download_url: url }] },
  });
  const updates = createAppUpdateModule();
  await expect(updates.check()).resolves.toMatchObject({ status: 'available', downloadUrl: url });
  await updates.openDownload(url);
  expect(Linking.openURL).toHaveBeenCalledWith(url);
});

test('a missing latest release is distinct from up-to-date', async () => {
  mockRequest.mockRejectedValue(new HttpError('Not found', { kind: 'http', status: 404 }));
  await expect(createAppUpdateModule().check()).resolves.toEqual({
    status: 'unavailable',
    reason: 'noRelease',
  });
});

test.each([
  new HttpError('Rate limited', { kind: 'http', status: 403 }),
  new HttpError('Offline', { kind: 'network' }),
  new HttpError('Timed out', { kind: 'timeout' }),
])('request failures are not converted into up-to-date: %s', async (error) => {
  mockRequest.mockRejectedValue(error);
  await expect(createAppUpdateModule().check()).rejects.toBe(error);
});

test.each(['invalid', 'v1.10.0/../../other', 'v1.10.0-beta.1'])(
  'rejects malformed or nonnumeric release tags: %s',
  async (tag) => {
    mockRequest.mockResolvedValue({ data: { ...release, tag_name: tag } });
    await expect(createAppUpdateModule().check()).rejects.toThrow();
  },
);

test('missing app version does not produce an update decision', async () => {
  jest.replaceProperty(Constants.expoConfig!, 'version', undefined);
  await expect(createAppUpdateModule().check()).resolves.toEqual({
    status: 'unavailable',
    reason: 'unknownVersion',
  });
  expect(mockRequest).not.toHaveBeenCalled();
});

test('invalid app version fails before requesting release metadata', async () => {
  jest.replaceProperty(Constants.expoConfig!, 'version', 'unknown');
  await expect(createAppUpdateModule().check()).rejects.toThrow('Invalid release version');
  expect(mockRequest).not.toHaveBeenCalled();
});

test.each([
  ['android', false],
  ['android', undefined],
  ['android', 'true'],
  ['android', 'false'],
  ['android', 1],
  ['ios', true],
  ['web', true],
] as const)('%s with flag %s cannot check or open an APK download', async (platform, flag) => {
  jest.replaceProperty(Platform, 'OS', platform);
  jest.replaceProperty(Constants.expoConfig!, 'extra', { isApkUpdatesEnabled: flag });
  const updates = createAppUpdateModule();
  expect(updates.isEnabled).toBe(false);
  await expect(updates.check()).resolves.toEqual({ status: 'unavailable', reason: 'unsupported' });
  await expect(updates.openDownload(downloadUrl)).rejects.toThrow('disabled');
  expect(mockRequest).not.toHaveBeenCalled();
  expect(Linking.openURL).not.toHaveBeenCalled();
});

test('only an explicit download action opens the APK in the system browser', async () => {
  const updates = createAppUpdateModule();
  await updates.check();
  expect(Linking.openURL).not.toHaveBeenCalled();
  await updates.openDownload(downloadUrl);
  expect(Linking.openURL).toHaveBeenCalledWith(downloadUrl);
});

test.each([
  'https://unrelated.example/app.apk',
  downloadUrl.replace('https:', 'http:'),
  downloadUrl.replace('gitcode.com', 'gitcode.com.unrelated.example'),
  downloadUrl.replace('cherry-studio-app/', 'cherry-studio/'),
  downloadUrl.replace('/v1.10.0/', '/v1.9.0/'),
  downloadUrl.replace('.apk', '.aab'),
  `${downloadUrl}?redirect=https://unrelated.example/`,
])('rejects an unexpected APK destination: %s', async (url) => {
  await expect(createAppUpdateModule().openDownload(url)).rejects.toThrow(
    'Invalid APK download URL',
  );
  expect(Linking.openURL).not.toHaveBeenCalled();
});

test('browser launch errors remain available to the UI for retry feedback', async () => {
  const error = new Error('No browser available');
  jest.mocked(Linking.openURL).mockRejectedValueOnce(error);
  await expect(createAppUpdateModule().openDownload(downloadUrl)).rejects.toBe(error);
});
