import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type {
  ApkUpdateRelease,
  AppUpdateDownload,
  AppUpdateRelease,
} from '@/shared/contracts/appUpdate';

import { AppUpdateDialog } from '../AppUpdateDialog';

const mockIdle = { status: 'idle' } as const;
let mockDownload: AppUpdateDownload = mockIdle;
const mockUpdate = {
  getDownload: () => mockDownload,
  subscribeDownload: () => () => {},
  releaseNotes: jest.fn(async () => 'Release notes'),
};
jest.mock('@/frontend/data/BackendProvider', () => ({ useBackendModule: () => mockUpdate }));
jest.mock('@/frontend/data/hooks', () => ({ usePreference: () => [0] }));
jest.mock('@/frontend/utils/openExternalUrl', () => ({ openExternalUrl: jest.fn() }));
jest.mock('@cherrystudio/ui/utils', () => ({ normalizeFontSizeStep: () => 0 }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-us' } }),
}));
jest.mock('@cherrystudio/ui/components', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? children : null),
  Button: ({ children }: { children: ReactNode }) => children,
  MarkdownText: ({ markdown }: { markdown: string }) => markdown,
  Spinner: () => null,
}));
const release: AppUpdateRelease = {
  channel: 'domestic-stores',
  store: 'honor',
  id: 'honor:20',
  currentVersion: '1.0.0',
  latestVersion: '2.0.0',
  notesSource: 'store',
  notes: 'Release notes',
};
const apkRelease: ApkUpdateRelease = {
  channel: 'apk',
  id: 'apk:2.0.0',
  currentVersion: '1.0.0',
  latestVersion: '2.0.0',
  notes: 'APK release notes',
  downloadUrl:
    'https://gitcode.com/CherryHQ/cherry-studio-app/releases/download/v2.0.0/cherry-studio-2.0.0-android.apk',
  checksumUrl: 'https://gitcode.com/CherryHQ/cherry-studio-app/releases/download/v2.0.0/SHA256SUMS',
};
const actions = {
  cancel: jest.fn(),
  close: jest.fn(),
  install: jest.fn(),
  retry: jest.fn(),
  start: jest.fn(),
};
let client: QueryClient;
let renderer: ReactTestRenderer;
const tree = (current: AppUpdateRelease | null) => (
  <QueryClientProvider client={client}>
    <AppUpdateDialog actions={actions} release={current} />
  </QueryClientProvider>
);
const rendered = () => JSON.stringify(renderer.toJSON());
beforeEach(() => {
  jest.clearAllMocks();
  mockDownload = mockIdle;
  mockUpdate.releaseNotes.mockResolvedValue('Release notes');
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  act(() => renderer.unmount());
  client.clear();
});

test('an open update dialog requests and displays release notes', async () => {
  await act(async () => {
    renderer = create(tree(release));
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(mockUpdate.releaseNotes).toHaveBeenCalledWith(release, 'en-us');
  expect(rendered()).toContain('Release notes');
  expect(rendered()).toContain('appUpdate.currentVersion');
  expect(rendered()).toContain('appUpdate.openStore');
});

test('reopening an update dialog shows cached notes without another request', async () => {
  await act(async () => {
    renderer = create(tree(release));
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(mockUpdate.releaseNotes).toHaveBeenCalledTimes(1);
  expect(rendered()).toContain('Release notes');
  act(() => renderer.update(tree(null)));
  act(() => renderer.update(tree(release)));
  expect(mockUpdate.releaseNotes).toHaveBeenCalledTimes(1);
  expect(rendered()).toContain('Release notes');
});

test('a reopened transfer shows its own release notes', async () => {
  mockDownload = {
    status: 'downloading',
    release: apkRelease,
    receivedBytes: 50,
    totalBytes: 100,
  };
  mockUpdate.releaseNotes.mockResolvedValue('APK release notes');
  await act(async () => {
    renderer = create(tree(null));
  });
  expect(mockUpdate.releaseNotes).not.toHaveBeenCalled();

  await act(async () => renderer.update(tree(release)));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(mockUpdate.releaseNotes).toHaveBeenCalledWith(apkRelease, 'en-us');
  expect(rendered()).toContain('APK release notes');
  expect(rendered()).toContain('appUpdate.downloadInBackground');
});
