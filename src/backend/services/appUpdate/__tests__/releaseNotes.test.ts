import type { ApkUpdateRelease, AppUpdateRelease } from '@/shared/contracts/appUpdate';

import { normalizeReleaseNotes, readReleaseNotes } from '../releaseNotes';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({ request: (request: unknown) => mockRequest(request) }),
}));

const apk: ApkUpdateRelease = {
  channel: 'apk',
  id: 'apk:1.10.0',
  currentVersion: '1.9.0',
  notes: '中文说明',
  latestVersion: '1.10.0',
  downloadUrl:
    'https://gitcode.com/CherryHQ/cherry-studio-app/releases/download/v1.10.0/cherry-studio-1.10.0-android.apk',
  checksumUrl:
    'https://gitcode.com/CherryHQ/cherry-studio-app/releases/download/v1.10.0/SHA256SUMS',
};

const domestic: AppUpdateRelease = {
  channel: 'domestic-stores',
  store: 'oppo',
  id: 'domestic-stores:oppo:apk:1.10.0',
  currentVersion: apk.currentVersion,
  latestVersion: apk.latestVersion,
  notes: apk.notes,
  notesSource: 'gitcode',
};

beforeEach(() => jest.clearAllMocks());

test.each([
  [
    '# Cherry Studio 1.10.0 更新日志\n\n简介\n\n## 新增功能\n\n- 一项\n\n## 下载安装\n\n- 附件\n\n[完整变更记录](https://example.com)\n',
    '简介\n\n## 新增功能\n\n- 一项',
  ],
  [
    '# Cherry Studio 1.10.0 Release Notes\n\n## Fixes\n\n- One\n\n## Download and Installation\n\n- APK\n',
    '## Fixes\n\n- One',
  ],
  ['Plain notes without headings', 'Plain notes without headings'],
  ['# Title only\n\n## 下载安装\n- APK', null],
  [null, null],
])('keeps only the in-app part of a published release body', (body, expected) => {
  expect(normalizeReleaseNotes(body)).toBe(expected);
});

test.each([apk, domestic])(
  'Chinese interfaces keep the GitCode notes for $channel',
  async (release) => {
    await expect(readReleaseNotes(release, 'zh-TW')).resolves.toBe('中文说明');
    expect(mockRequest).not.toHaveBeenCalled();
  },
);

test('notes language stays independent from an overseas APK source', async () => {
  const globalApk: ApkUpdateRelease = {
    ...apk,
    downloadUrl: apk.downloadUrl.replace('gitcode.com', 'github.com'),
    notes: 'English notes',
  };
  await expect(readReleaseNotes(globalApk, 'en-US')).resolves.toBe('English notes');
  expect(mockRequest).not.toHaveBeenCalled();
  mockRequest.mockResolvedValue({ data: { body: '# Title\n\n中文说明' } });
  await expect(readReleaseNotes(globalApk, 'zh-CN')).resolves.toBe('中文说明');
});

test.each([apk, domestic])(
  'other interfaces read the same-tag English notes for $channel',
  async (release) => {
    mockRequest.mockResolvedValue({ data: { body: '# Title\n\n## Fixes\n\n- One' } });
    await expect(readReleaseNotes(release, 'en-US')).resolves.toBe('## Fixes\n\n- One');
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/repos/CherryHQ/cherry-studio-app/releases/tags/v1.10.0' }),
    );
  },
);

test.each([apk, domestic])(
  'unreachable or empty English notes keep the $channel source notes',
  async (release) => {
    mockRequest.mockRejectedValueOnce(new Error('offline'));
    await expect(readReleaseNotes(release, 'en-US')).resolves.toBe('中文说明');
    mockRequest.mockResolvedValueOnce({ data: { body: '' } });
    await expect(readReleaseNotes(release, 'de-DE')).resolves.toBe('中文说明');
  },
);

test.each<AppUpdateRelease>([
  {
    channel: 'app-store',
    id: 'app-store:1:1.10.0',
    currentVersion: '1.9.0',
    notes: 'New in 1.10.0',
    latestVersion: '1.10.0',
    storeUrl: 'https://apps.apple.com/us/app/id1',
  },
  { ...domestic, store: 'honor', notesSource: 'store', notes: 'Vendor notes' },
])('store release $id uses its own notes without a GitHub request', async (store) => {
  await expect(readReleaseNotes(store, 'en-US')).resolves.toBe(store.notes);
  expect(mockRequest).not.toHaveBeenCalled();
});
