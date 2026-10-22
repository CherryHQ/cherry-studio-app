import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AppUpdateModule, AppUpdateResult } from '@/shared/contracts/appUpdate';

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
  check: jest.fn<Promise<AppUpdateResult>, [AbortSignal?]>(),
  getDownload: jest.fn(() => ({ status: 'idle' }) as const),
} as unknown as AppUpdateModule & { check: jest.Mock };
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
jest.mock('../AppUpdateProvider', () => ({ useAppUpdateActions: () => ({ open: mockOpen }) }));

let renderer: ReactTestRenderer;
let queryClient: QueryClient;
const tree = () => (
  <QueryClientProvider client={queryClient}>
    <AppUpdateObserver />
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
