import type { AlertConfirmOptions, ToastShowOptions } from '@cherrystudio/ui/components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { appUpdateQueryOptions } from '@/frontend/data/appUpdate';
import type {
  ApkUpdateRelease,
  AppUpdateDownload,
  AppUpdateModule,
  AppUpdateResult,
} from '@/shared/contracts/appUpdate';

import { AppUpdateProvider, useAppUpdateActions } from '../AppUpdateProvider';

let mockAlert = { confirm: jest.fn((_options: AlertConfirmOptions) => {}) };
const mockToast = { show: jest.fn((_options: ToastShowOptions) => 'update') };
const mockUpdate = {
  channel: 'apk',
  isEnabled: true,
  check: jest.fn<Promise<AppUpdateResult>, [AbortSignal?]>(),
  getDownload: jest.fn((): AppUpdateDownload => ({ status: 'idle' })),
  subscribeDownload: jest.fn(() => () => {}),
  download: jest.fn(async (_release: ApkUpdateRelease) => {}),
  cancelDownload: jest.fn(async () => {}),
  install: jest.fn(async () => 'opened' as const),
  requestInstallPermission: jest.fn(async () => true),
  openStore: jest.fn(async () => {}),
} satisfies AppUpdateModule;

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: mockAlert }),
  useToast: () => ({ toast: mockToast }),
}));
jest.mock('@/frontend/data/BackendProvider', () => ({
  useBackendModule: () => mockUpdate,
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const oldRelease: ApkUpdateRelease = {
  channel: 'apk',
  id: 'apk:2.0.0',
  currentVersion: '1.0.0',
  latestVersion: '2.0.0',
  downloadUrl:
    'https://gitcode.com/CherryHQ/cherry-studio-app/releases/download/v2.0.0/cherry-studio-2.0.0-android.apk',
  checksumUrl: 'https://gitcode.com/CherryHQ/cherry-studio-app/releases/download/v2.0.0/SHA256SUMS',
};
const latestRelease: ApkUpdateRelease = {
  ...oldRelease,
  id: 'apk:2.1.0',
  latestVersion: '2.1.0',
  downloadUrl: oldRelease.downloadUrl.replaceAll('2.0.0', '2.1.0'),
  checksumUrl: oldRelease.checksumUrl.replace('2.0.0', '2.1.0'),
};

let actions: ReturnType<typeof useAppUpdateActions>;
let renderer: ReactTestRenderer;
let queryClient: QueryClient;
function Probe() {
  const current = useAppUpdateActions();
  useLayoutEffect(() => {
    actions = current;
  });
  return null;
}
const tree = () => (
  <QueryClientProvider client={queryClient}>
    <AppUpdateProvider>
      <Probe />
    </AppUpdateProvider>
  </QueryClientProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.check.mockReset().mockResolvedValue({ status: 'available', ...latestRelease });
  mockUpdate.getDownload.mockReturnValue({ status: 'idle' });
  // Keep the app's query/deduplication behavior while making error retries immediate.
  queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  act(() => {
    renderer = create(tree());
  });
});
afterEach(() => {
  act(() => renderer.unmount());
  queryClient.clear();
});

test('retrying a failed download refreshes discovery instead of reusing the failed or cached release', async () => {
  mockUpdate.getDownload.mockReturnValue({
    status: 'failed',
    release: oldRelease,
    reason: 'download',
  });
  queryClient.setQueryData(appUpdateQueryOptions(mockUpdate).queryKey, {
    status: 'available',
    ...oldRelease,
  });

  await act(async () => actions.check());

  expect(mockUpdate.check).toHaveBeenCalledTimes(1);
  expect(mockAlert.confirm).toHaveBeenCalledTimes(1);
  await act(async () => mockAlert.confirm.mock.calls[0]![0].onConfirm());
  expect(mockUpdate.download).toHaveBeenCalledWith({ status: 'available', ...latestRelease });
});

test('a withdrawn failed release reports no release instead of offering its cached download', async () => {
  mockUpdate.getDownload.mockReturnValue({
    status: 'failed',
    release: oldRelease,
    reason: 'verification',
  });
  queryClient.setQueryData(appUpdateQueryOptions(mockUpdate).queryKey, {
    status: 'available',
    ...oldRelease,
  });
  mockUpdate.check.mockResolvedValue({ status: 'unavailable', reason: 'noRelease' });

  await act(async () => actions.check());

  expect(mockAlert.confirm).not.toHaveBeenCalled();
  expect(mockUpdate.download).not.toHaveBeenCalled();
  expect(mockToast.show).toHaveBeenLastCalledWith({ label: 'appUpdate.noRelease' });
});

test('concurrent manual checks share one confirmation even across provider rerenders', async () => {
  const response = Promise.withResolvers<AppUpdateResult>();
  mockUpdate.check.mockReturnValue(response.promise);
  let first!: Promise<void>;
  let second!: Promise<void>;
  act(() => {
    first = actions.check();
    second = actions.check();
  });
  expect(second).toBe(first);
  // A locale/context change can recreate the actions while a request is still pending.
  mockAlert = { ...mockAlert };
  act(() => renderer.update(tree()));
  expect(actions.check()).toBe(first);

  await act(async () => {
    response.resolve({ status: 'available', ...latestRelease });
    await first;
  });

  expect(mockUpdate.check).toHaveBeenCalledTimes(1);
  expect(mockAlert.confirm).toHaveBeenCalledTimes(1);
  expect(mockToast.show).toHaveBeenCalledTimes(1);
});

test('a failed manual check releases its guard so a later attempt can succeed', async () => {
  mockUpdate.getDownload.mockReturnValue({
    status: 'failed',
    release: oldRelease,
    reason: 'download',
  });
  // App update queries retry once, so fail both attempts.
  mockUpdate.check
    .mockRejectedValueOnce(new Error('Offline'))
    .mockRejectedValueOnce(new Error('Offline'));

  await act(async () => actions.check());

  expect(mockAlert.confirm).not.toHaveBeenCalled();
  expect(mockToast.show).toHaveBeenLastCalledWith({ label: 'appUpdate.failed', variant: 'danger' });
  await act(async () => actions.check());
  expect(mockAlert.confirm).toHaveBeenCalledTimes(1);
});
