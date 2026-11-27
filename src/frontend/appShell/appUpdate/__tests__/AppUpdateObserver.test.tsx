import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AppUpdateResult } from '@/shared/contracts/appUpdate';

import type { AppUpdateDialog } from '../AppUpdateDialog';
import { AppUpdateObserver } from '../AppUpdateObserver';

const available: AppUpdateResult = {
  status: 'available',
  channel: 'app-store',
  id: 'app-store:1:2.0.0',
  currentVersion: '1.0.0',
  notes: null,
  latestVersion: '2.0.0',
  storeUrl: 'https://apps.apple.com/us/app/id1',
};
const mockUpdate = {
  channel: 'app-store',
  isEnabled: true,
  getRequiredVersion: jest.fn(() => null as string | null),
  refreshRequiredVersion: jest.fn(async () => null as string | null),
  check: jest.fn<Promise<AppUpdateResult>, [AbortSignal?]>(),
  getDownload: jest.fn(() => ({ status: 'idle' }) as const),
};
const mockOpen = jest.fn();
let mockPathname = '/';
let mockParams: Record<string, string> = {};
let mockCoverVisible = false;
let mockPrivacyPending = false;
let mockReceivingShare = false;
let mockReminder: { releaseId: string; remindedAt: number } | undefined;

jest.mock('expo-router', () => ({
  useGlobalSearchParams: () => mockParams,
  usePathname: () => mockPathname,
}));
jest.mock('@/frontend/appShell/privacy', () => ({
  usePrivacyConsentPending: () => mockPrivacyPending,
}));
jest.mock('@/frontend/appShell/startup', () => ({
  useStartupCoverVisible: () => mockCoverVisible,
}));
jest.mock('@/frontend/appShell/systemEntry', () => ({
  useSystemEntryReceiving: () => mockReceivingShare,
}));
jest.mock('@/frontend/data/BackendProvider', () => ({ useBackendModule: () => mockUpdate }));
jest.mock('@/frontend/data/CacheService', () => ({
  cacheService: { getPersist: () => mockReminder },
}));
let mockDialog: Parameters<typeof AppUpdateDialog>[0];
jest.mock('../AppUpdateDialog', () => ({
  AppUpdateDialog: (props: typeof mockDialog) => {
    mockDialog = props;
    return null;
  },
}));
const dialogActions = {
  close: jest.fn(),
  cancel: jest.fn(),
  start: jest.fn(),
  install: jest.fn(),
  retry: jest.fn(),
};

let renderer: ReactTestRenderer;
let queryClient: QueryClient;
const tree = () => (
  <QueryClientProvider client={queryClient}>
    <AppUpdateObserver actions={dialogActions} onOffer={mockOpen} release={null} />
  </QueryClientProvider>
);
async function launch() {
  await act(async () => {
    renderer = create(tree());
  });
  // Let the startup check resolve and its result render.
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}
async function rerender() {
  await act(async () => renderer.update(tree()));
}

beforeAll(() => {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
});
beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.getRequiredVersion.mockReturnValue(null);
  mockUpdate.refreshRequiredVersion.mockResolvedValue(null);
  mockUpdate.check.mockResolvedValue(available);
  mockPathname = '/';
  mockParams = {};
  mockCoverVisible = false;
  mockPrivacyPending = false;
  mockReceivingShare = false;
  mockReminder = undefined;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  act(() => renderer.unmount());
  queryClient.clear();
});

test('a cold start on the landing chat offers the release once', async () => {
  await launch();
  expect(mockOpen).toHaveBeenCalledWith(available);

  await act(async () => {
    await queryClient.refetchQueries();
  });
  expect(mockOpen).toHaveBeenCalledTimes(1);
});

test('waits for the startup cover before offering the release', async () => {
  mockCoverVisible = true;
  await launch();
  expect(mockOpen).not.toHaveBeenCalled();

  mockCoverVisible = false;
  await rerender();
  expect(mockOpen).toHaveBeenCalledTimes(1);
});

test.each([
  ['another route', () => (mockPathname = '/settings/about')],
  ['a shared draft', () => (mockParams = { agentId: 'a', composerHandoff: 'h' })],
  ['a share still importing', () => (mockReceivingShare = true)],
  ['a notification session', () => (mockParams = { sessionId: 's' })],
  ['a pending privacy decision', () => (mockPrivacyPending = true)],
])('a launch into %s is not interrupted, even after returning to chat', async (_, arrange) => {
  arrange();
  await launch();
  mockPathname = '/';
  mockParams = {};
  mockPrivacyPending = false;
  mockReceivingShare = false;
  await rerender();

  expect(mockOpen).not.toHaveBeenCalled();
});

test('a release already offered within a day is not offered again', async () => {
  mockReminder = { releaseId: available.id, remindedAt: Date.now() - 60_000 };
  await launch();
  expect(mockOpen).not.toHaveBeenCalled();
});

test('a new chat for a chosen agent still counts as the landing chat', async () => {
  mockParams = { agentId: 'a' };
  await launch();
  expect(mockOpen).toHaveBeenCalledTimes(1);
});

test('privacy consent prevents starting a vendor query', async () => {
  mockPrivacyPending = true;
  await launch();
  expect(mockUpdate.check).not.toHaveBeenCalled();
  expect(mockUpdate.refreshRequiredVersion).not.toHaveBeenCalled();
  expect(mockOpen).not.toHaveBeenCalled();
});

test('a cached minimum blocks a deep link even without release details, until the floor is withdrawn', async () => {
  mockPathname = '/settings/about';
  mockReminder = { releaseId: available.id, remindedAt: Date.now() };
  mockUpdate.getRequiredVersion.mockReturnValue('2.0.0');
  mockUpdate.refreshRequiredVersion.mockRejectedValueOnce(new Error('Offline'));
  mockUpdate.check.mockRejectedValueOnce(new Error('Offline'));
  await launch();
  expect(mockDialog.release).toBeNull();
  expect(mockDialog.required?.version).toBe('2.0.0');
  expect(mockOpen).not.toHaveBeenCalled();

  await act(async () => {
    await queryClient.refetchQueries();
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(mockDialog.required).toBeNull();
  expect(mockDialog.release).toBeNull();
});

test('a failed cold-start check ends this launch reminder even after returning to foreground', async () => {
  mockUpdate.check.mockRejectedValueOnce(new Error('Rate limited'));
  const listener = jest.spyOn(AppState, 'addEventListener');
  try {
    await launch();
    expect(mockUpdate.check).toHaveBeenCalledTimes(1);
    const onChange = listener.mock.calls.find(([type]) => type === 'change')![1];
    await act(async () => onChange('background'));
    await act(async () => onChange('active'));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(mockOpen).not.toHaveBeenCalled();
  } finally {
    listener.mockRestore();
  }
});
