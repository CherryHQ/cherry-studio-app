import type { Notification } from 'expo-notifications';
import { AppState, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { BackgroundTaskLink } from '@/shared/backgroundActivity/taskLink';
import { BACKGROUND_NOTIFICATION_OWNER } from '@/shared/backgroundActivity/types';

import { isBackgroundTaskVisible } from '../foregroundActivityAttention';
import { useBackgroundTaskNotifications } from '../useBackgroundTaskNotifications/useBackgroundTaskNotifications.android';

let mockFocused = true;
const mockPresented = jest.fn<Promise<Notification[]>, []>();
const mockDismiss = jest.fn(async (_id: string) => {});
const mockNotificationListeners = new Set<(notification: Notification) => void>();
const appStateListeners = new Set<(state: AppStateStatus) => void>();
const task = { kind: 'chat', sessionId: 's' } as const;
let renderer: ReactTestRenderer | undefined;

jest.mock('expo-linking', () => ({ resolveScheme: () => 'cherrystudio' }));
jest.mock('expo-notifications', () => ({
  getPresentedNotificationsAsync: () => mockPresented(),
  dismissNotificationAsync: (id: string) => mockDismiss(id),
  addNotificationReceivedListener: (listener: (notification: Notification) => void) => {
    mockNotificationListeners.add(listener);
    return { remove: () => mockNotificationListeners.delete(listener) };
  },
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    const focused = mockFocused;
    useEffect(() => (focused ? effect() : undefined), [effect, focused]);
  },
}));

function Probe({
  target = task,
  enabled = true,
}: {
  target?: BackgroundTaskLink;
  enabled?: boolean;
}) {
  useBackgroundTaskNotifications(target, enabled);
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  mockPresented.mockResolvedValue([]);
  setAppState('active');
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  });
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  jest.restoreAllMocks();
});

test('clears old and new notices for the viewed task while retaining other unread tasks', async () => {
  mockPresented.mockResolvedValue([
    notice('old', 'cherrystudio:///?agentId=a&sessionId=s'),
    notice('new', 'cherrystudio:///?sessionId=s'),
    notice('other-chat', 'cherrystudio:///?sessionId=other'),
    notice('painting', 'cherrystudio://paintings?paintingId=s'),
    notice('foreign-owner', 'cherrystudio:///?sessionId=s', 'other'),
  ]);
  await act(async () => {
    renderer = create(<Probe />);
  });
  expect(mockDismiss.mock.calls).toEqual([['old'], ['new']]);
  expect(isBackgroundTaskVisible(task)).toBe(true);
});

test('acknowledges only a foreground focused page and releases subscriptions on blur', async () => {
  setAppState('background');
  await act(async () => {
    renderer = create(<Probe />);
  });
  expect(mockPresented).not.toHaveBeenCalled();
  expect(isBackgroundTaskVisible(task)).toBe(false);
  await act(async () => setAppState('active'));
  expect(mockPresented).toHaveBeenCalledTimes(1);
  expect(isBackgroundTaskVisible(task)).toBe(true);
  mockFocused = false;
  await act(async () => renderer?.update(<Probe />));
  expect(isBackgroundTaskVisible(task)).toBe(false);
  expect(appStateListeners.size).toBe(0);
  expect(mockNotificationListeners.size).toBe(0);
});

test('a drawer-covered or unloaded surface does not acknowledge its task', async () => {
  await act(async () => {
    renderer = create(<Probe enabled={false} />);
  });
  expect(mockPresented).not.toHaveBeenCalled();
  expect(isBackgroundTaskVisible(task)).toBe(false);
});

test('an in-flight drawer read cannot clear notices after the user leaves the task', async () => {
  let resolvePresented!: (notifications: Notification[]) => void;
  mockPresented.mockReturnValue(
    new Promise((resolve) => {
      resolvePresented = resolve;
    }),
  );
  await act(async () => {
    renderer = create(<Probe />);
  });
  mockFocused = false;
  await act(async () => renderer?.update(<Probe />));
  await act(async () => resolvePresented([notice('late', 'cherrystudio:///?sessionId=s')]));
  expect(mockDismiss).not.toHaveBeenCalled();
});

test('clears a matching late delivery while preserving unrelated task notifications', async () => {
  await act(async () => {
    renderer = create(<Probe target={{ kind: 'painting', paintingId: 'p' }} />);
  });
  await act(async () => {
    for (const listener of mockNotificationListeners) {
      listener(notice('paint', 'cherrystudio://paintings/p'));
      listener(notice('chat', 'cherrystudio:///?sessionId=p'));
    }
  });
  expect(mockDismiss.mock.calls).toEqual([['paint']]);
});

function setAppState(state: AppStateStatus) {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: state });
  for (const listener of appStateListeners) listener(state);
}

function notice(id: string, url: string, owner = BACKGROUND_NOTIFICATION_OWNER): Notification {
  return {
    date: 0,
    request: {
      identifier: id,
      trigger: null,
      content: {
        title: null,
        subtitle: null,
        body: null,
        categoryIdentifier: null,
        sound: null,
        data: { owner, url },
      },
    },
  };
}
