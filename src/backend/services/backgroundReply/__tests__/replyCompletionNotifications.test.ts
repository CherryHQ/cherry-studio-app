import {
  dismissNotificationAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  type NotificationPermissionsStatus,
} from 'expo-notifications';
import { AppState, type AppStateStatus } from 'react-native';

import type { ReplyCompletionNotificationEvent } from '../replyCompletionNotifications';
import { createReplyCompletionNotifier } from '../replyCompletionNotifications';

jest.mock('expo-notifications', () => ({
  dismissNotificationAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(
    async ({ identifier }: { identifier?: string }) => identifier ?? '',
  ),
}));

const notices = jest.mocked(scheduleNotificationAsync);
const dismissals = jest.mocked(dismissNotificationAsync);
const permissions = jest.mocked(getPermissionsAsync);
const permissionRequest = jest.mocked(requestPermissionsAsync);
const enabled = jest.fn(() => true);

function setAppState(state: AppStateStatus): void {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: state });
}

function event(
  overrides: Partial<ReplyCompletionNotificationEvent> = {},
): ReplyCompletionNotificationEvent {
  return {
    deepLinkUrl: 'cherrystudio:///?sessionId=session-1',
    detail: 'Done',
    occurredInBackground: true,
    outcome: 'completed',
    title: 'First session',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  setAppState('background');
  enabled.mockReturnValue(true);
  notices.mockImplementation(async ({ identifier }) => identifier ?? '');
  permissions.mockResolvedValue({ granted: true } as NotificationPermissionsStatus);
  permissionRequest.mockResolvedValue({ granted: true } as NotificationPermissionsStatus);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  setAppState('active');
});

describe('createReplyCompletionNotifier', () => {
  it('delivers one notification for a background completion', async () => {
    const notifier = createReplyCompletionNotifier({
      isReplyCompletionNotificationEnabled: enabled,
    });

    await expect(notifier.notifyTurnFinished(event())).resolves.toBe(true);
    expect(notices).toHaveBeenCalledTimes(1);
    expect(notices).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'cherry-reply-cherrystudio_____sessionId_session_1',
        trigger: null,
        content: expect.objectContaining({
          title: 'First session',
          data: {
            owner: 'cherry-background-activity',
            terminal: true,
            url: 'cherrystudio:///?sessionId=session-1',
          },
        }),
      }),
    );
  });

  it('stays silent for cancellations, foreground endings, and a disabled preference', async () => {
    const notifier = createReplyCompletionNotifier({
      isReplyCompletionNotificationEnabled: enabled,
    });

    await expect(notifier.notifyTurnFinished(event({ outcome: 'cancelled' }))).resolves.toBe(false);
    await expect(notifier.notifyTurnFinished(event({ occurredInBackground: false }))).resolves.toBe(
      false,
    );
    enabled.mockReturnValue(false);
    await expect(notifier.notifyTurnFinished(event())).resolves.toBe(false);
    enabled.mockReturnValue(true);
    expect(notices).not.toHaveBeenCalled();
  });

  it('stays silent once the user is back at delivery time', async () => {
    const notifier = createReplyCompletionNotifier({
      isReplyCompletionNotificationEnabled: enabled,
    });
    setAppState('active');

    await expect(notifier.notifyTurnFinished(event())).resolves.toBe(false);
    expect(notices).not.toHaveBeenCalled();
  });

  it('honors provisional and ephemeral iOS authorization, not bare denial', async () => {
    const notifier = createReplyCompletionNotifier({
      isReplyCompletionNotificationEnabled: enabled,
    });

    permissions.mockResolvedValue({
      canAskAgain: true,
      granted: false,
      ios: { status: 3 }, // PROVISIONAL
    } as unknown as NotificationPermissionsStatus);
    await expect(notifier.notifyTurnFinished(event())).resolves.toBe(true);

    permissions.mockResolvedValue({
      canAskAgain: false,
      granted: false,
      ios: { status: 1 }, // DENIED
    } as unknown as NotificationPermissionsStatus);
    await expect(notifier.notifyTurnFinished(event())).resolves.toBe(false);
  });

  it('replaces the previous notice for one destination', async () => {
    const notifier = createReplyCompletionNotifier({
      isReplyCompletionNotificationEnabled: enabled,
    });

    await notifier.notifyTurnFinished(event());
    await notifier.notifyTurnFinished(event({ title: 'Second round' }));

    // Every delivery first retires the destination's previous notice, by
    // the same deterministic identifier.
    expect(dismissals).toHaveBeenCalledTimes(2);
    expect(dismissals).toHaveBeenCalledWith('cherry-reply-cherrystudio_____sessionId_session_1');
    expect(notices).toHaveBeenCalledTimes(2);
  });

  it('retires a delivered notice when its destination opens or a new reply starts', async () => {
    const notifier = createReplyCompletionNotifier({
      isReplyCompletionNotificationEnabled: enabled,
    });

    await notifier.notifyTurnFinished(event());
    notifier.dismissDestination('cherrystudio:///?sessionId=session-1');
    expect(dismissals).toHaveBeenCalledWith('cherry-reply-cherrystudio_____sessionId_session_1');

    // Dismissal rides the deterministic identifier, so it also retires a
    // notice delivered before a process restart, with no in-memory record.
    notifier.dismissDestination('cherrystudio:///?sessionId=session-2');
    expect(dismissals).toHaveBeenCalledWith('cherry-reply-cherrystudio_____sessionId_session_2');
  });

  it('requests permission once, only in the foreground and only while enabled', async () => {
    const notifier = createReplyCompletionNotifier({
      isReplyCompletionNotificationEnabled: enabled,
    });

    setAppState('background');
    notifier.requestPermissionOnce();
    expect(permissionRequest).not.toHaveBeenCalled();

    setAppState('active');
    enabled.mockReturnValue(false);
    notifier.requestPermissionOnce();
    expect(permissionRequest).not.toHaveBeenCalled();

    enabled.mockReturnValue(true);
    notifier.requestPermissionOnce();
    notifier.requestPermissionOnce();
    expect(permissionRequest).toHaveBeenCalledTimes(1);
  });
});
