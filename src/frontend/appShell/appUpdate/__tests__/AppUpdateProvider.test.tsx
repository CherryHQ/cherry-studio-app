import type { AlertConfirmOptions, ToastShowOptions } from '@cherrystudio/ui/components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type {
  ApkUpdateRelease,
  AppUpdateDownload,
  AppUpdateModule,
  AppUpdateResult,
} from '@/shared/contracts/appUpdate';

import type { AppUpdateDialog } from '../AppUpdateDialog';
import { AppUpdateProvider, useAppUpdateActions } from '../AppUpdateProvider';
import { appUpdateQueryOptions } from '../appUpdateQueries';

type AppUpdateDialogProps = Parameters<typeof AppUpdateDialog>[0];

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
  install: jest.fn(
    async (): Promise<'opened' | 'permissionRequired' | 'invalidPackage'> => 'opened',
  ),
  requestInstallPermission: jest.fn(async () => true),
  openStore: jest.fn(async () => {}),
  releaseNotes: jest.fn(async () => null),
} satisfies AppUpdateModule;

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: mockAlert }),
  useToast: () => ({ toast: mockToast }),
}));
jest.mock('@/frontend/data/BackendProvider', () => ({
  useBackendModule: () => mockUpdate,
}));
let mockDialog: AppUpdateDialogProps;
jest.mock('../AppUpdateDialog', () => ({
  AppUpdateDialog: (props: AppUpdateDialogProps) => {
    mockDialog = props;
    return null;
  },
}));
const mockSetPersist = jest.fn();
jest.mock('@/frontend/data/CacheService', () => ({
  cacheService: { setPersist: (...args: unknown[]) => mockSetPersist(...args) },
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const oldRelease: ApkUpdateRelease = {
  channel: 'apk',
  id: 'apk:2.0.0',
  currentVersion: '1.0.0',
  notes: null,
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
const recordAvailable = (release: ApkUpdateRelease) =>
  queryClient.setQueryData(appUpdateQueryOptions(mockUpdate).queryKey, {
    status: 'available',
    ...release,
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.check.mockReset().mockResolvedValue({ status: 'available', ...latestRelease });
  mockUpdate.getDownload.mockReturnValue({ status: 'idle' });
  mockUpdate.install.mockResolvedValue('opened');
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

test('a recorded release opens the dialog without another request and counts as its reminder', async () => {
  recordAvailable(latestRelease);

  await act(async () => actions.check());

  expect(mockUpdate.check).not.toHaveBeenCalled();
  expect(mockDialog.release).toMatchObject({ id: latestRelease.id });
  expect(mockSetPersist).toHaveBeenCalledWith('app_update.last_reminder', {
    releaseId: latestRelease.id,
    remindedAt: expect.any(Number),
  });
});

test('an unknown result is checked, and an up-to-date result is reported without a dialog', async () => {
  mockUpdate.check.mockResolvedValue({ status: 'upToDate', currentVersion: '1.0.0' });

  await act(async () => actions.check());

  expect(mockDialog.release).toBeNull();
  expect(mockToast.show).toHaveBeenLastCalledWith({ label: 'appUpdate.upToDate' });
});

test('an active or finished transfer reopens its own release', async () => {
  mockUpdate.getDownload.mockReturnValue({
    status: 'failed',
    release: oldRelease,
    reason: 'download',
  });
  recordAvailable(latestRelease);

  await act(async () => actions.check());

  expect(mockUpdate.check).not.toHaveBeenCalled();
  expect(mockDialog.release).toBe(oldRelease);
});

test('retrying a failed download refreshes discovery and downloads the latest release', async () => {
  recordAvailable(oldRelease);
  act(() => actions.open(oldRelease));

  await act(async () => mockDialog.actions.retry());

  expect(mockUpdate.check).toHaveBeenCalledTimes(1);
  expect(mockDialog.release).toMatchObject({ id: latestRelease.id });
  expect(mockUpdate.download).toHaveBeenCalledWith({ status: 'available', ...latestRelease });
});

test('a withdrawn release closes the dialog on retry instead of downloading it again', async () => {
  act(() => actions.open(oldRelease));
  mockUpdate.check.mockResolvedValue({ status: 'unavailable', reason: 'noRelease' });

  await act(async () => mockDialog.actions.retry());

  expect(mockDialog.release).toBeNull();
  expect(mockUpdate.download).not.toHaveBeenCalled();
  expect(mockToast.show).toHaveBeenLastCalledWith({ label: 'appUpdate.noRelease' });
});

test('store releases close the dialog and open the store', async () => {
  const store = {
    channel: 'app-store',
    id: 'app-store:1:2.1.0',
    currentVersion: '1.0.0',
    notes: null,
    latestVersion: '2.1.0',
    storeUrl: 'https://apps.apple.com/us/app/id1',
  } as const;
  act(() => actions.open(store));

  act(() => mockDialog.actions.start(store));

  expect(mockDialog.release).toBeNull();
  expect(mockUpdate.openStore).toHaveBeenCalledWith(store);
});

test('installation asks for permission outside the dialog and keeps it open for a rejected package', async () => {
  act(() => actions.open(oldRelease));
  mockUpdate.install.mockResolvedValueOnce('invalidPackage');
  await act(async () => mockDialog.actions.install());
  expect(mockDialog.release).toBe(oldRelease);
  expect(mockAlert.confirm).not.toHaveBeenCalled();

  mockUpdate.install.mockResolvedValueOnce('permissionRequired');
  await act(async () => mockDialog.actions.install());
  expect(mockDialog.release).toBeNull();
  expect(mockAlert.confirm).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'appUpdate.installPermissionTitle' }),
  );
});

test('concurrent manual checks share one request and one dialog even across provider rerenders', async () => {
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
  expect(mockSetPersist).toHaveBeenCalledTimes(1);
  expect(mockToast.show).toHaveBeenCalledTimes(1);
});

test('a failed manual check releases its guard so a later attempt can succeed', async () => {
  // App update queries retry once, so fail both attempts.
  mockUpdate.check
    .mockRejectedValueOnce(new Error('Offline'))
    .mockRejectedValueOnce(new Error('Offline'));

  await act(async () => actions.check());

  expect(mockDialog.release).toBeNull();
  expect(mockToast.show).toHaveBeenLastCalledWith({ label: 'appUpdate.failed', variant: 'danger' });
  await act(async () => actions.check());
  expect(mockDialog.release).toMatchObject({ id: latestRelease.id });
});
