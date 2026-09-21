import {
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  type NotificationPermissionsStatus,
} from 'expo-notifications';
import { AppState, type AppStateStatus } from 'react-native';

import type { BackgroundReplyActivityProps } from '@/shared/backgroundActivity/chatReply';
import { BACKGROUND_NOTIFICATION_OWNER } from '@/shared/backgroundActivity/types';

import type { BackgroundActivityPresenter } from '../presenter';
import { createReplyCompletionNotifier } from '../replyCompletionNotifications';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(
    async ({ identifier }: { identifier?: string }) => identifier ?? '',
  ),
}));

const notices = jest.mocked(scheduleNotificationAsync);
const permissions = jest.mocked(getPermissionsAsync);
const permissionRequest = jest.mocked(requestPermissionsAsync);
const enabled = jest.fn(() => true);
const events: string[] = [];

function innerPresenter(): BackgroundActivityPresenter<BackgroundReplyActivityProps> {
  return {
    canStartInBackground: false,
    shouldHoldLeaseUntilDelivery: false,
    clearOrphans: async () => 0,
    start: (props, deepLinkUrl) => {
      events.push(`start:${props.phase}:${deepLinkUrl ?? ''}`);
      return {
        update: async (nextProps) => {
          events.push(`update:${nextProps.phase}`);
        },
        end: async (policy, finalProps) => {
          events.push(`end:${policy}:${finalProps.phase}`);
        },
      };
    },
  };
}

function surface(isEnabled = true) {
  enabled.mockReturnValue(isEnabled);
  return createReplyCompletionNotifier(innerPresenter(), {
    isReplyCompletionNotificationEnabled: enabled,
  }).start(props('responding'), 'cherrystudio:///?sessionId=s');
}

function props(phase: BackgroundReplyActivityProps['phase']): BackgroundReplyActivityProps {
  return {
    phase,
    title: 'Chat',
    detail: phase,
    compactIcon: 'bubble-ellipsis',
    icon: 'bubble-ellipsis',
    startedAtEpochMs: 1000,
  };
}

const inBackground = { phaseStartedInBackground: true };

function setAppState(state: AppStateStatus): void {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: state });
}

beforeEach(() => {
  jest.clearAllMocks();
  events.length = 0;
  setAppState('active');
  enabled.mockReturnValue(true);
  notices.mockImplementation(async ({ identifier }) => identifier ?? '');
  permissions.mockResolvedValue({ granted: true } as NotificationPermissionsStatus);
  permissionRequest.mockResolvedValue({ granted: true } as NotificationPermissionsStatus);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('raises one notification for a completion that happens in the background', async () => {
  const activity = surface();
  setAppState('background');
  await activity.update(props('completed'), inBackground);
  await activity.end('default', props('completed'), inBackground);
  expect(notices).toHaveBeenCalledTimes(1);
  expect(notices).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.objectContaining({
        title: 'Chat',
        body: 'completed',
        sound: 'default',
        data: {
          owner: BACKGROUND_NOTIFICATION_OWNER,
          terminal: true,
          url: 'cherrystudio:///?sessionId=s',
        },
      }),
    }),
  );
});

test('does not repost a completion for the final surface update', async () => {
  const activity = surface();
  setAppState('background');
  await activity.end('default', props('completed'), inBackground);
  await activity.update(props('completed'), inBackground);
  expect(notices).toHaveBeenCalledTimes(1);
});

test('notifies a background failure so a waiting user is not left hanging', async () => {
  const activity = surface();
  setAppState('background');
  await activity.update(props('failed'), inBackground);
  expect(notices).toHaveBeenCalledTimes(1);
});

test('keeps foreground completion silent even when delivery runs after background entry', async () => {
  const activity = surface();
  setAppState('background');
  await activity.update(props('completed'), { phaseStartedInBackground: false });
  await activity.end('default', props('completed'), { phaseStartedInBackground: false });
  expect(notices).not.toHaveBeenCalled();
});

test('a queued background completion stays silent once the user is back in the app', async () => {
  const activity = surface();
  setAppState('active');
  await activity.update(props('completed'), inBackground);
  expect(notices).not.toHaveBeenCalled();
});

test('cancelled turns and manager shutdown endings stay silent', async () => {
  const cancelled = surface();
  setAppState('background');
  await cancelled.update(props('cancelled'), inBackground);
  await cancelled.end('default', props('cancelled'), inBackground);
  const stopped = surface();
  await stopped.end('immediate', props('completed'), inBackground);
  expect(notices).not.toHaveBeenCalled();
});

test('a streaming update leaves the terminal notice armed', async () => {
  const activity = surface();
  setAppState('background');
  await activity.update(props('responding'), inBackground);
  expect(notices).not.toHaveBeenCalled();
  await activity.end('default', props('completed'), inBackground);
  expect(notices).toHaveBeenCalledTimes(1);
});

test('re-arms the notice when a new turn inherits a surface whose slot was consumed silently', async () => {
  const activity = surface();
  // Turn 1 completes in the foreground: the one-shot slot is consumed without delivery.
  setAppState('active');
  await activity.update(props('completed'), { phaseStartedInBackground: false });
  // Turn 2 inherits the same handle; its background completion must still notify.
  setAppState('background');
  await activity.update(props('preparing'), inBackground);
  await activity.update(props('completed'), inBackground);
  expect(notices).toHaveBeenCalledTimes(1);
});

test('declares the delivery lease so ending cannot suspend before submission', () => {
  const notifier = createReplyCompletionNotifier(innerPresenter(), {
    isReplyCompletionNotificationEnabled: enabled,
  });
  expect(notifier.shouldHoldLeaseUntilDelivery).toBe(true);
});

test('a delivered notice replaces the lingering Live Activity card', async () => {
  const activity = surface();
  setAppState('background');
  await activity.end('default', props('completed'), inBackground);
  expect(notices).toHaveBeenCalledTimes(1);
  expect(events).toContain('end:immediate:completed');
});

test('a silent ending keeps the default dismissal', async () => {
  permissions.mockResolvedValue({ granted: false } as NotificationPermissionsStatus);
  const activity = surface();
  setAppState('background');
  await activity.end('default', props('completed'), inBackground);
  expect(notices).not.toHaveBeenCalled();
  expect(events).toContain('end:default:completed');
});

test('permission denial skips delivery', async () => {
  permissions.mockResolvedValue({ granted: false } as NotificationPermissionsStatus);
  const activity = surface();
  setAppState('background');
  await activity.update(props('completed'), inBackground);
  expect(notices).not.toHaveBeenCalled();
});

test('the preference gate disables both delivery and the permission prompt', async () => {
  const activity = surface(false);
  setAppState('background');
  await activity.update(props('completed'), inBackground);
  expect(notices).not.toHaveBeenCalled();
  expect(permissionRequest).not.toHaveBeenCalled();
});

test('requests permission once per notifier when generations start in the foreground', async () => {
  const notifier = createReplyCompletionNotifier(innerPresenter(), {
    isReplyCompletionNotificationEnabled: enabled,
  });
  notifier.start(props('responding'));
  notifier.start(props('responding'));
  expect(permissionRequest).toHaveBeenCalledTimes(1);
});

test('keeps driving the wrapped Live Activity surface', async () => {
  const activity = surface();
  await activity.update(props('responding'), inBackground);
  await activity.end('default', props('completed'), inBackground);
  expect(events).toEqual([
    'start:responding:cherrystudio:///?sessionId=s',
    'update:responding',
    'end:default:completed',
  ]);
});

test('a failed notification does not break the surface lifecycle', async () => {
  notices.mockRejectedValueOnce(new Error('Scheduling unavailable'));
  const activity = surface();
  setAppState('background');
  await expect(activity.update(props('completed'), inBackground)).resolves.toBeUndefined();
  expect(events).toEqual(['start:responding:cherrystudio:///?sessionId=s', 'update:completed']);
});
