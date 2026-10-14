import {
  dismissNotificationAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationCategoryAsync,
  type NotificationPermissionsStatus,
} from 'expo-notifications';
import { AppState, type AppStateStatus } from 'react-native';

import type { ReplyCompletionNotificationEvent } from '../replyCompletionNotifications';
import { createReplyCompletionNotifier } from '../replyCompletionNotifications';

jest.mock('expo-notifications', () => ({
  setNotificationCategoryAsync: jest.fn(async () => {}),
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
  it('registers background approval and text reply controls with their request token', async () => {
    const notifier = createReplyCompletionNotifier({
      isReplyCompletionNotificationEnabled: enabled,
    });
    const actions = {
      token: 'request-token',
      prompt: 'Which topic?',
      buttons: [{ id: 'option:snow', label: 'Snow' }],
      reply: { label: 'Reply', placeholder: 'Your answer', choices: ['Snow'] },
    };
    await notifier.notifyAttention({
      deepLinkUrl: event().deepLinkUrl,
      detail: 'Waiting',
      phase: 'awaiting-answer',
      title: 'Question',
      isCurrent: () => true,
      actions,
    });
    expect(setNotificationCategoryAsync).toHaveBeenCalledWith(expect.any(String), [
      {
        identifier: 'option:snow',
        buttonTitle: 'Snow',
        options: { opensAppToForeground: false, isAuthenticationRequired: true },
      },
      {
        identifier: 'reply',
        buttonTitle: 'Reply',
        textInput: { submitButtonTitle: 'Reply', placeholder: 'Your answer' },
        options: { opensAppToForeground: false, isAuthenticationRequired: true },
      },
    ]);
    expect(notices).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          body: 'Waiting\nWhich topic?',
          categoryIdentifier: expect.any(String),
          data: expect.objectContaining({ actionToken: 'request-token' }),
        }),
      }),
    );
  });
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

  it('awaits retirement of the activity before delivering its replacement', async () => {
    const notifier = createReplyCompletionNotifier({
      isReplyCompletionNotificationEnabled: enabled,
    });
    let retired!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const retirement = new Promise<void>((resolve) => {
      retired = resolve;
    });
    const delivery = notifier.notifyTurnFinished(
      event({
        beforeDelivery: async () => {
          entered();
          await retirement;
        },
      }),
    );
    await started;
    expect(notices).not.toHaveBeenCalled();
    retired();
    await expect(delivery).resolves.toBe(true);
  });

  it('does not deliver a predecessor after a new turn takes over during retirement', async () => {
    const notifier = createReplyCompletionNotifier({
      isReplyCompletionNotificationEnabled: enabled,
    });
    let current = true;
    await expect(
      notifier.notifyTurnFinished(
        event({
          isCurrent: () => current,
          beforeDelivery: async () => {
            current = false;
          },
        }),
      ),
    ).resolves.toBe(false);
    expect(notices).not.toHaveBeenCalled();
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
    expect(dismissals).toHaveBeenCalledTimes(4);
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

  it('requests permission for decisions even when completion alerts are disabled', async () => {
    const notifier = createReplyCompletionNotifier({
      isReplyCompletionNotificationEnabled: enabled,
    });

    setAppState('background');
    notifier.requestPermissionOnce();
    expect(permissionRequest).not.toHaveBeenCalled();

    setAppState('active');
    enabled.mockReturnValue(false);
    notifier.requestPermissionOnce();
    expect(permissionRequest).toHaveBeenCalledTimes(1);

    enabled.mockReturnValue(true);
    notifier.requestPermissionOnce();
    notifier.requestPermissionOnce();
    expect(permissionRequest).toHaveBeenCalledTimes(1);
  });
});

describe('session attention delivery', () => {
  const attention = () => ({
    deepLinkUrl: 'cherrystudio://remote?connectionId=pc&sessionId=s',
    detail: 'Waiting for your answer',
    phase: 'awaiting-answer' as const,
    title: 'Session',
    isCurrent: () => true,
  });

  it('delivers decisions with completion alerts disabled and preserves the session destination', async () => {
    enabled.mockReturnValue(false);
    const notifier = createReplyCompletionNotifier({
      isReplyCompletionNotificationEnabled: enabled,
    });
    await expect(notifier.notifyAttention(attention())).resolves.toBe(true);
    expect(notices).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          body: 'Waiting for your answer',
          sound: 'default',
          data: {
            owner: 'cherry-background-activity',
            attention: true,
            url: attention().deepLinkUrl,
          },
        }),
      }),
    );
  });

  it('uses foreground attention without a system alert and honors denied permission in background', async () => {
    const onForegroundAttention = jest.fn();
    const notifier = createReplyCompletionNotifier({
      isReplyCompletionNotificationEnabled: enabled,
      onForegroundAttention,
    });
    setAppState('active');
    await notifier.notifyAttention(attention());
    expect(onForegroundAttention).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'awaiting-answer', url: attention().deepLinkUrl }),
    );
    setAppState('background');
    permissions.mockResolvedValue({ granted: false } as NotificationPermissionsStatus);
    await expect(notifier.notifyAttention(attention())).resolves.toBe(false);
    expect(notices).not.toHaveBeenCalled();
  });

  it('suppresses resolved requests while permission is loading', async () => {
    const notifier = createReplyCompletionNotifier({
      isReplyCompletionNotificationEnabled: enabled,
    });
    let current = true;
    permissions.mockImplementationOnce(async () => {
      current = false;
      return { granted: true } as NotificationPermissionsStatus;
    });
    await expect(
      notifier.notifyAttention({ ...attention(), isCurrent: () => current }),
    ).resolves.toBe(false);
    expect(notices).not.toHaveBeenCalled();
  });

  it('retires a notification that becomes obsolete during native delivery', async () => {
    const notifier = createReplyCompletionNotifier({
      isReplyCompletionNotificationEnabled: enabled,
    });
    let current = true;
    notices.mockImplementationOnce(async ({ identifier }) => {
      current = false;
      return identifier ?? '';
    });
    await expect(
      notifier.notifyAttention({ ...attention(), isCurrent: () => current }),
    ).resolves.toBe(false);
    expect(dismissals).toHaveBeenCalledWith(notices.mock.calls[0]?.[0].identifier);
  });
});
