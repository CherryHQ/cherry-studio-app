import type { NotificationResponse } from 'expo-notifications';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BACKGROUND_NOTIFICATION_OWNER } from '@/shared/backgroundActivity/types';

import { registerVisibleBackgroundTask } from '../foregroundActivityAttention';
import { useBackgroundActivityNavigation } from '../useBackgroundActivityNavigation/useBackgroundActivityNavigation.android';

let mockResponse: NotificationResponse | null;
let mockNavigationKey: string | undefined;
const mockRouter = { navigate: jest.fn() };
const mockClear = jest.fn(() => {
  mockResponse = null;
});
const mockDismiss = jest.fn(async (_id: string) => {});
let renderer: ReactTestRenderer | undefined;

jest.mock('expo-linking', () => ({ resolveScheme: () => 'cherrystudio' }));
jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'default',
  useLastNotificationResponse: () => mockResponse,
  clearLastNotificationResponse: () => mockClear(),
  dismissNotificationAsync: (id: string) => mockDismiss(id),
}));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useRootNavigationState: () => ({ key: mockNavigationKey }),
}));

function Probe() {
  useBackgroundActivityNavigation();
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNavigationKey = 'root';
  mockResponse = response('cherrystudio://paintings/p');
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

test('retains a cold-start response until navigation mounts, then opens the task once', async () => {
  mockNavigationKey = undefined;
  await act(async () => {
    renderer = create(<Probe />);
  });
  expect(mockClear).not.toHaveBeenCalled();
  expect(mockRouter.navigate).not.toHaveBeenCalled();
  mockNavigationKey = 'root';
  await act(async () => renderer?.update(<Probe />));
  expect(mockRouter.navigate).toHaveBeenCalledWith({
    pathname: '/paintings',
    params: { paintingId: 'p' },
  });
  expect(mockDismiss).toHaveBeenCalledWith('notice');
  await act(async () => renderer?.update(<Probe />));
  expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
});

test('consumes a tap for the already visible task without adding navigation history', async () => {
  const release = registerVisibleBackgroundTask({ kind: 'painting', paintingId: 'p' });
  try {
    await act(async () => {
      renderer = create(<Probe />);
    });
    expect(mockRouter.navigate).not.toHaveBeenCalled();
    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(mockDismiss).toHaveBeenCalledWith('notice');
  } finally {
    release();
  }
});

test('ignores unrelated notifications and consumes invalid owned destinations without navigation', async () => {
  mockResponse = response('cherrystudio://settings', 'other');
  await act(async () => {
    renderer = create(<Probe />);
  });
  expect(mockClear).not.toHaveBeenCalled();
  expect(mockDismiss).not.toHaveBeenCalled();
  mockResponse = response('cherrystudio://settings');
  await act(async () => renderer?.update(<Probe />));
  expect(mockRouter.navigate).not.toHaveBeenCalled();
  expect(mockClear).toHaveBeenCalledTimes(1);
});

function response(url: string, owner = BACKGROUND_NOTIFICATION_OWNER): NotificationResponse {
  return {
    actionIdentifier: 'default',
    notification: { request: { identifier: 'notice', content: { data: { owner, url } } } },
  } as NotificationResponse;
}
