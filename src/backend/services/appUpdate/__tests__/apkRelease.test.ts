import { HttpError } from '@/backend/services/http';
import type { ApkUpdateRelease } from '@/shared/contracts/appUpdate';

import { assertApkRelease, checkApkRelease, readApkChecksum } from '../apkRelease';

const mockRequest = jest.fn();
const mockRoute = jest.fn();
jest.mock('@/backend/services/http', () => ({
  ...jest.requireActual('@/backend/services/http'),
  createHttpClient: ({ baseUrl }: { baseUrl: string }) => ({
    request: (request: unknown) => {
      mockRoute(baseUrl);
      return mockRequest(request);
    },
  }),
}));
const downloadUrl =
  'https://gitcode.com/CherryHQ/cherry-studio-app/releases/download/v1.10.0/cherry-studio-1.10.0-android.apk';
const checksumUrl =
  'https://gitcode.com/CherryHQ/cherry-studio-app/releases/download/v1.10.0/SHA256SUMS';
const apk = {
  name: 'cherry-studio-1.10.0-android.apk',
  type: 'attach',
  browser_download_url: downloadUrl,
};
const checksum = { name: 'SHA256SUMS', type: 'attach', browser_download_url: checksumUrl };
const release = {
  tag_name: 'v1.10.0',
  prerelease: false,
  release_status: 'latest',
  assets: [apk, checksum],
};
const available: ApkUpdateRelease = {
  channel: 'apk',
  id: 'apk:1.10.0',
  currentVersion: '1.9.0',
  notes: null,
  latestVersion: '1.10.0',
  downloadUrl,
  checksumUrl,
};
const globalAvailable: ApkUpdateRelease = {
  ...available,
  downloadUrl: downloadUrl.replace('gitcode.com', 'github.com'),
  checksumUrl: checksumUrl.replace('gitcode.com', 'github.com'),
};
const githubRelease = {
  tag_name: 'v1.10.0',
  prerelease: false,
  draft: false,
  assets: [
    { name: apk.name, browser_download_url: globalAvailable.downloadUrl },
    { name: 'SHA256SUMS', browser_download_url: globalAvailable.checksumUrl },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRequest.mockResolvedValue({ data: release });
});

test('uses GitHub metadata, APK and checksum from the same repository release abroad', async () => {
  mockRequest.mockResolvedValueOnce({ data: githubRelease });
  await expect(checkApkRelease('1.9.0', 'github')).resolves.toEqual({
    status: 'available',
    ...globalAvailable,
  });
  expect(mockRoute).toHaveBeenLastCalledWith('https://api.github.com');
  expect(() => assertApkRelease(globalAvailable, '1.9.0')).not.toThrow();
  const hash = 'a'.repeat(64);
  mockRequest.mockResolvedValueOnce({ data: `${hash}  ${apk.name}\n` });
  await expect(readApkChecksum(globalAvailable, new AbortController().signal)).resolves.toBe(hash);
  expect(mockRoute).toHaveBeenLastCalledWith('https://github.com');
});

test.each([
  { draft: true },
  { draft: undefined },
  { prerelease: true },
  {
    assets: [{ ...apk }, { name: 'SHA256SUMS', browser_download_url: globalAvailable.checksumUrl }],
  },
])('rejects unpublished or cross-source GitHub packages: %j', async (overrides) => {
  mockRequest.mockResolvedValueOnce({ data: { ...githubRelease, ...overrides } });
  await expect(checkApkRelease('1.9.0', 'github')).resolves.toEqual({
    status: 'unavailable',
    reason: 'noRelease',
  });
});

test('never mixes a GitHub APK with a GitCode checksum', () => {
  expect(() => assertApkRelease({ ...globalAvailable, checksumUrl }, '1.9.0')).toThrow();
});

test('selects the signed-package release attachments and forwards cancellation', async () => {
  const signal = new AbortController().signal;
  await expect(checkApkRelease('1.9.0', 'gitcode', signal)).resolves.toEqual({
    status: 'available',
    ...available,
  });
  expect(mockRequest).toHaveBeenCalledWith(
    expect.objectContaining({ signal, maxResponseBytes: 512_000 }),
  );
});

test('carries the published notes without the title or download section', async () => {
  mockRequest.mockResolvedValue({
    data: {
      ...release,
      body: '# Cherry Studio 1.10.0 更新日志\n\n- 新功能\n\n## 下载安装\n\n- APK',
    },
  });
  await expect(checkApkRelease('1.9.0', 'gitcode')).resolves.toMatchObject({ notes: '- 新功能' });
});

test.each(['1.10.0', '2.0.0'])('never offers a downgrade from %s', async (version) => {
  await expect(checkApkRelease(version, 'gitcode')).resolves.toEqual({
    status: 'upToDate',
    currentVersion: version,
  });
});

test.each([
  { assets: [] },
  { assets: [apk] },
  { assets: [checksum] },
  { assets: [{ ...apk, type: 'source' }, checksum] },
  { assets: [{ ...apk, name: 'cherry-studio-1.10.0-android.aab' }, checksum] },
  { assets: [{ ...apk, browser_download_url: 'https://example.com/app.apk' }, checksum] },
  {
    assets: [
      apk,
      { ...checksum, browser_download_url: checksumUrl.replace('/v1.10.0/', '/v1.9.0/') },
    ],
  },
  { prerelease: true },
  { release_status: 'pre' },
  { release_status: 'draft' },
])('requires stable, matching APK and checksum attachments: %j', async (overrides) => {
  mockRequest.mockResolvedValue({ data: { ...release, ...overrides } });
  await expect(checkApkRelease('1.9.0', 'gitcode')).resolves.toEqual({
    status: 'unavailable',
    reason: 'noRelease',
  });
});

test('unprefixed release tags are also valid', async () => {
  mockRequest.mockResolvedValue({
    data: {
      ...release,
      tag_name: '1.10.0',
      assets: release.assets.map((asset) => ({
        ...asset,
        browser_download_url: asset.browser_download_url.replace('/v1.10.0/', '/1.10.0/'),
      })),
    },
  });
  const result = await checkApkRelease('1.9.0', 'gitcode');
  if (result.status !== 'available' || result.channel !== 'apk') throw new Error('Expected APK');
  expect(() => assertApkRelease(result, '1.9.0')).not.toThrow();
});

test('missing release is distinct from network failure', async () => {
  mockRequest.mockRejectedValueOnce(new HttpError('Not found', { kind: 'http', status: 404 }));
  await expect(checkApkRelease('1.9.0', 'gitcode')).resolves.toMatchObject({
    status: 'unavailable',
  });
  mockRequest.mockRejectedValueOnce(new HttpError('Offline', { kind: 'network' }));
  await expect(checkApkRelease('1.9.0', 'gitcode')).rejects.toThrow('Offline');
});

test.each(['invalid', 'v1.10.0-beta.1', 'v1.10.0/../../other'])(
  'rejects malformed metadata %s',
  async (tag_name) => {
    mockRequest.mockResolvedValue({ data: { ...release, tag_name } });
    await expect(checkApkRelease('1.9.0', 'gitcode')).rejects.toThrow();
  },
);

test.each([
  { downloadUrl: 'https://example.com/app.apk' },
  { downloadUrl: downloadUrl.replace('https:', 'http:') },
  { downloadUrl: downloadUrl.replace('gitcode.com', 'gitcode.com.example.com') },
  { downloadUrl: `${downloadUrl}?redirect=evil` },
  { downloadUrl: downloadUrl.replace('.apk', '.aab') },
  { checksumUrl: checksumUrl.replace('/v1.10.0/', '/v1.9.0/') },
  { latestVersion: '1.11.0' },
  { id: 'apk:2.0.0' },
])('revalidates the release before downloading: %j', (overrides) => {
  expect(() => assertApkRelease({ ...available, ...overrides }, '1.9.0')).toThrow();
});

test('revalidates current installed version before downloading', () => {
  expect(() => assertApkRelease(available, '1.10.0')).toThrow();
});

test('reads only the exact APK checksum and rejects missing or ambiguous entries', async () => {
  const hash = 'a'.repeat(64);
  const line = `${hash}  ${apk.name}`;
  mockRequest.mockResolvedValueOnce({ data: `${line}\n` });
  await expect(readApkChecksum(available, new AbortController().signal)).resolves.toBe(hash);
  for (const data of ['not a checksum', `${hash}  another.apk`, `${line}\n${line}`]) {
    mockRequest.mockResolvedValueOnce({ data });
    await expect(readApkChecksum(available, new AbortController().signal)).rejects.toThrow();
  }
});
