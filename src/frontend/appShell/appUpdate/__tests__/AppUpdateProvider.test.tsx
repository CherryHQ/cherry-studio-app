import type { AlertConfirmOptions, ToastShowOptions } from '@cherrystudio/ui/components';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { use, useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type {
  ApkUpdateRelease,
  AppUpdateDownload,
  AppUpdateModule,
  AppUpdateRelease,
  AppUpdateResult,
} from '@/shared/contracts/appUpdate';

import type { AppUpdateDialog } from '../AppUpdateDialog';
import { AppUpdateProvider, useAppUpdateActions } from '../AppUpdateProvider';
import { appUpdateQueryOptions } from '../appUpdateQueries';
import { RequiredUpdateContext } from '../requiredUpdate';

type AppUpdateDialogProps = Parameters<typeof AppUpdateDialog>[0];

let mockAlert = { confirm: jest.fn((_options: AlertConfirmOptions) => {}) };
const mockToast = { show: jest.fn((_options: ToastShowOptions) => 'update') };
const mockUpdate = {
  channel: 'apk' as AppUpdateModule['channel'],
  isEnabled: true,
  checkRequiredVersion: jest.fn<Promise<string | null>, []>(),
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
jest.mock('@/frontend/appShell/privacy', () => ({ usePrivacyConsentPending: () => false }));
jest.mock('@/frontend/appShell/startup', () => ({ useStartupCoverVisible: () => false }));
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
let requiredUpdate: boolean;
let renderer: ReactTestRenderer;
let queryClient: QueryClient;
function Probe() {
  const current = useAppUpdateActions();
  const required = use(RequiredUpdateContext);
  useLayoutEffect(() => {
    actions = current;
    requiredUpdate = required;
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
const recordAvailable = (release: AppUpdateRelease) =>
  queryClient.setQueryData(appUpdateQueryOptions(mockUpdate).queryKey, {
    status: 'available',
    ...release,
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.channel = 'apk';
  mockUpdate.checkRequiredVersion.mockReset().mockResolvedValue(null);
  mockUpdate.check.mockReset().mockResolvedValue({ status: 'available', ...latestRelease });
  mockUpdate.getDownload.mockReturnValue({ status: 'idle' });
  mockUpdate.install.mockResolvedValue('opened');
  queryClient = new QueryClient();
});
async function launch() {
  await act(async () => {
    renderer = create(tree());
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

afterEach(() => {
  act(() => renderer.unmount());
  queryClient.clear();
});

test('a recorded release opens the dialog without another request', async () => {
  await launch();
  recordAvailable(latestRelease);

  await act(async () => actions.check());

  expect(mockUpdate.check).not.toHaveBeenCalled();
  expect(mockDialog.release).toMatchObject({ id: latestRelease.id });
});

test('a manual App Store check does not reopen an offer from a previous storefront', async () => {
  await launch();
  mockUpdate.channel = 'app-store';
  recordAvailable({
    channel: 'app-store',
    id: 'app-store:123:2.0',
    currentVersion: '1.0',
    latestVersion: '2.0',
    notes: null,
    storeUrl: 'https://apps.apple.com/jp/app/id123',
  });
  mockUpdate.check.mockResolvedValue({ status: 'unavailable', reason: 'storefrontUnavailable' });

  await act(async () => actions.check());

  expect(mockUpdate.check).toHaveBeenCalledTimes(1);
  expect(mockDialog.release).toBeNull();
  expect(mockToast.show).toHaveBeenLastCalledWith({ label: 'appUpdate.failed' });
});

test('an unknown result is checked, and an up-to-date result is reported without a dialog', async () => {
  await launch();
  mockUpdate.check.mockResolvedValue({ status: 'upToDate', currentVersion: '1.0.0' });

  await act(async () => actions.check());

  expect(mockDialog.release).toBeNull();
  expect(mockToast.show).toHaveBeenLastCalledWith({ label: 'appUpdate.upToDate' });
});

test('an active or finished transfer reopens its own release', async () => {
  await launch();
  mockUpdate.getDownload.mockReturnValue({
    status: 'failed',
    release: oldRelease,
    reason: 'download',
  });
  recordAvailable(latestRelease);

  await act(async () => actions.check());

  expect(mockUpdate.check).not.toHaveBeenCalled();
  expect(mockDialog.release).toMatchObject(oldRelease);
});

test('retrying a failed download refreshes discovery and downloads the latest release', async () => {
  await launch();
  recordAvailable(oldRelease);
  await act(async () => actions.check());

  await act(async () => mockDialog.actions.checkAndStart());

  expect(mockUpdate.check).toHaveBeenCalledTimes(1);
  expect(mockUpdate.check).toHaveBeenCalledWith(expect.any(AbortSignal), { force: true });
  expect(mockDialog.release).toMatchObject({ id: latestRelease.id });
  expect(mockUpdate.download).toHaveBeenCalledWith({ status: 'available', ...latestRelease });
});

test('a withdrawn release closes the dialog on retry instead of downloading it again', async () => {
  await launch();
  recordAvailable(oldRelease);
  await act(async () => actions.check());
  mockUpdate.check.mockResolvedValue({ status: 'unavailable', reason: 'noRelease' });

  await act(async () => mockDialog.actions.checkAndStart());

  expect(mockDialog.release).toBeNull();
  expect(mockUpdate.download).not.toHaveBeenCalled();
  expect(mockToast.show).toHaveBeenLastCalledWith({ label: 'appUpdate.noRelease' });
});

test('store releases close the dialog and open the store', async () => {
  await launch();
  const store = {
    channel: 'app-store',
    id: 'app-store:1:2.1.0',
    currentVersion: '1.0.0',
    notes: null,
    latestVersion: '2.1.0',
    storeUrl: 'https://apps.apple.com/us/app/id1',
  } as const;
  recordAvailable(store);
  await act(async () => actions.check());

  act(() => mockDialog.actions.start(store));

  expect(mockDialog.release).toBeNull();
  expect(mockUpdate.openStore).toHaveBeenCalledWith(store);
});

test('installation asks for permission outside the dialog and keeps it open for a rejected package', async () => {
  await launch();
  recordAvailable(oldRelease);
  await act(async () => actions.check());
  mockUpdate.install.mockResolvedValueOnce('invalidPackage');
  await act(async () => mockDialog.actions.install());
  expect(mockDialog.release).toMatchObject(oldRelease);
  expect(mockAlert.confirm).not.toHaveBeenCalled();

  mockUpdate.install.mockResolvedValueOnce('permissionRequired');
  await act(async () => mockDialog.actions.install());
  expect(mockDialog.release).toBeNull();
  expect(mockAlert.confirm).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'appUpdate.installPermissionTitle' }),
  );
});

test('concurrent manual checks share one request and one dialog even across provider rerenders', async () => {
  await launch();
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
  expect(mockToast.show).toHaveBeenCalledTimes(1);
});

test('a failed manual check releases its guard so a later attempt can succeed', async () => {
  await launch();
  mockUpdate.check.mockRejectedValueOnce(new Error('Offline'));

  await act(async () => actions.check());

  expect(mockDialog.release).toBeNull();
  expect(mockToast.show).toHaveBeenLastCalledWith({ label: 'appUpdate.failed', variant: 'danger' });
  await act(async () => actions.check());
  expect(mockDialog.release).toMatchObject({ id: latestRelease.id });
  expect(mockUpdate.check).toHaveBeenCalledTimes(2);
  expect(mockUpdate.check).toHaveBeenNthCalledWith(1, expect.any(AbortSignal), { force: true });
  expect(mockUpdate.check).toHaveBeenNthCalledWith(2, expect.any(AbortSignal), { force: true });
});

test('another trigger preserves the open prompt until it closes', async () => {
  await launch();
  recordAvailable(oldRelease);
  await act(async () => actions.check());
  recordAvailable(latestRelease);
  await act(async () => actions.check());
  expect(mockDialog.release).toMatchObject(oldRelease);
  act(() => mockDialog.actions.close());
  recordAvailable(oldRelease);
  await act(async () => actions.check());
  expect(mockDialog.release).toMatchObject({ id: oldRelease.id });
});

test('domestic updates use the existing dialog and only open the store after confirmation', async () => {
  await launch();
  const release = {
    channel: 'domestic-stores',
    store: 'oppo',
    id: 'domestic-stores:oppo:apk:2.1.0',
    currentVersion: '1.0.0',
    latestVersion: '2.1.0',
    notesSource: 'gitcode',
    notes: null,
  } as const;
  mockUpdate.check.mockResolvedValue({ status: 'available', ...release });
  await act(async () => actions.check());
  expect(mockDialog.release).toMatchObject(release);
  expect(mockUpdate.openStore).not.toHaveBeenCalled();
  expect(mockUpdate.download).not.toHaveBeenCalled();
  act(() => mockDialog.actions.start(release));
  expect(mockDialog.release).toBeNull();
  expect(mockUpdate.openStore).toHaveBeenCalledWith(release);
  expect(mockUpdate.download).not.toHaveBeenCalled();
});

test('a supported launch stays silent without checking any release channel', async () => {
  await launch();
  expect(mockDialog.requiredVersion).toBeNull();
  expect(requiredUpdate).toBe(false);
  expect(mockDialog.release).toBeNull();
  expect(mockUpdate.checkRequiredVersion).toHaveBeenCalledTimes(1);
  expect(mockUpdate.check).not.toHaveBeenCalled();
});

test('a required launch waits for the update action and keeps its store destination on return', async () => {
  mockUpdate.checkRequiredVersion.mockResolvedValue('2.0.0');
  mockUpdate.channel = 'app-store';
  const store = {
    channel: 'app-store',
    id: 'app-store:123:2.0.0',
    currentVersion: '1.0.0',
    latestVersion: '2.0.0',
    notes: null,
    storeUrl: 'https://apps.apple.com/us/app/id123',
  } as const;
  mockUpdate.check.mockResolvedValue({ status: 'available', ...store });
  await launch();
  expect(mockDialog.requiredVersion).toBe('2.0.0');
  expect(requiredUpdate).toBe(true);
  expect(mockUpdate.check).not.toHaveBeenCalled();
  await act(async () => mockDialog.actions.checkAndStart());
  expect(mockUpdate.openStore).toHaveBeenCalledWith(expect.objectContaining(store));
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
  expect(mockUpdate.checkRequiredVersion).toHaveBeenCalledTimes(1);
  expect(mockUpdate.check).toHaveBeenCalledTimes(1);
  expect(mockDialog.release).toMatchObject(store);
  focusManager.setFocused(undefined);
});
