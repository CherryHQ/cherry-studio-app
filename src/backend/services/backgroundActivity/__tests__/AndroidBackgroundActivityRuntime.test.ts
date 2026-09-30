import * as notifications from 'expo-notifications';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import background from 'react-native-background-actions';

import type { BackgroundReplyActivityProps } from '@/shared/backgroundActivity/chatReply';
import { BACKGROUND_NOTIFICATION_OWNER } from '@/shared/backgroundActivity/types';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { AndroidBackgroundActivityRuntime } from '../AndroidBackgroundActivityRuntime';

jest.mock('react-native-background-actions', () => ({
  __esModule: true,
  default: {
    isRunning: jest.fn(),
    isProtected: jest.fn(() => true),
    on: jest.fn(),
    off: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    updateNotification: jest.fn(),
  },
}));
jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
  dismissNotificationAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(),
  getPresentedNotificationsAsync: jest.fn(async () => []),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async ({ identifier }: { identifier: string }) => identifier),
  setNotificationChannelAsync: jest.fn(async () => {}),
  setNotificationHandler: jest.fn(),
}));

const mockTaskIds = new Map<string, number>();
const mockTaskNotifications = new Map<number, { ongoing: boolean; title: string }>();
const mockTaskNative = {
  getBackgroundTaskNotificationId: jest.fn((key: string) => {
    if (!mockTaskIds.has(key)) mockTaskIds.set(key, 100000 + mockTaskIds.size);
    return mockTaskIds.get(key)!;
  }),
  showBackgroundTaskNotification: jest.fn(
    async (
      id: number,
      title: string,
      _body: string,
      _url: string | null,
      ongoing: boolean,
      _alert: boolean,
      _channel: string,
    ) => {
      mockTaskNotifications.set(id, { title, ongoing });
    },
  ),
  dismissBackgroundTaskNotification: jest.fn(async (id: number) => {
    mockTaskNotifications.delete(id);
  }),
  clearBackgroundTaskNotifications: jest.fn(async () => {}),
};
jest.mock('../../../../../modules/system-integration', () => ({
  getSystemIntegration: () => mockTaskNative,
}));

const native = jest.mocked(background);
const notices = jest.mocked(notifications);
const foregroundAttention = jest.fn();
const completionNotificationsEnabled = jest.fn(() => true);
const environment = {
  translate: (key: string) => key,
  isReplyCompletionNotificationEnabled: completionNotificationsEnabled,
  onForegroundAttention: foregroundAttention,
};
let running: boolean;
let runtime: AndroidBackgroundActivityRuntime;
const listeners = new Set<(state: AppStateStatus) => void>();
const serviceStoppedListeners = new Set<() => void>();

beforeEach(async () => {
  jest.clearAllMocks();
  mockTaskIds.clear();
  mockTaskNotifications.clear();
  mockTaskNative.showBackgroundTaskNotification.mockImplementation(
    async (id, title, _body, _url, ongoing) => {
      mockTaskNotifications.set(id, { title, ongoing });
    },
  );
  jest.useFakeTimers();
  running = false;
  listeners.clear();
  serviceStoppedListeners.clear();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 35 });
  setAppState('active');
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  native.isRunning.mockImplementation(() => running);
  native.on.mockImplementation((_event, listener) => {
    serviceStoppedListeners.add(listener);
    return background;
  });
  native.off.mockImplementation((_event, listener) => {
    if (listener) serviceStoppedListeners.delete(listener);
    return background;
  });
  native.start.mockImplementation(async () => {
    running = true;
  });
  native.stop.mockImplementation(async () => {
    running = false;
  });
  native.updateNotification.mockResolvedValue(undefined);
  notices.getPresentedNotificationsAsync.mockResolvedValue([]);
  notices.getPermissionsAsync.mockResolvedValue({
    granted: true,
  } as notifications.NotificationPermissionsStatus);
  notices.scheduleNotificationAsync.mockImplementation(async ({ identifier }) => identifier!);
  notices.requestPermissionsAsync.mockResolvedValue({
    granted: false,
  } as notifications.NotificationPermissionsStatus);
  runtime = new AndroidBackgroundActivityRuntime(environment);
  await runtime._doInit();
});

afterEach(async () => {
  await runtime._doStop();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('a failed service start leaves work running unprotected and retries after the next foreground entry', async () => {
  native.start.mockRejectedValueOnce(new Error('Native service admission failed'));
  const interrupted = jest.fn();
  const surface = runtime.createPresenter<BackgroundReplyActivityProps>().start(props('preparing'));
  runtime.acquire('chat', interrupted);
  await flush();
  expect(running).toBe(false);
  expect(notices.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  // Content updates must not turn one failed admission into a retry loop.
  await surface.update(props('responding'));
  expect(native.start).toHaveBeenCalledTimes(1);
  setAppState('background');
  setAppState('active');
  await flush();
  expect(native.start).toHaveBeenCalledTimes(2);
  expect(running).toBe(true);
  expect(interrupted).not.toHaveBeenCalled();
});

test('a failed start does not block protection for work admitted after the unprotected work ends', async () => {
  native.start.mockRejectedValueOnce(new Error('Native service admission failed'));
  const unprotected = runtime.acquire('chat');
  await flush();
  unprotected.release();
  runtime.acquire('next-task');
  await flush();
  expect(native.start).toHaveBeenCalledTimes(2);
  expect(running).toBe(true);
});

test('returning while the service runs requests permission skipped during startup', async () => {
  native.start.mockImplementationOnce(async () => {
    running = true;
    setAppState('background');
  });
  runtime.acquire('chat');
  await flush();
  expect(notices.requestPermissionsAsync).not.toHaveBeenCalled();
  setAppState('active');
  await flush();
  expect(notices.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(native.start).toHaveBeenCalledTimes(1);
});

test('a notification update failure does not interrupt a service that is still running', async () => {
  const interrupted = jest.fn();
  native.updateNotification.mockRejectedValueOnce(new Error('Update failed'));
  runtime.acquire('chat', interrupted);
  await flush();
  expect(running).toBe(true);
  expect(interrupted).not.toHaveBeenCalled();
  expect(notices.requestPermissionsAsync).toHaveBeenCalledTimes(1);
});

test('returning retries a failed permission request without repeatedly prompting after denial', async () => {
  notices.requestPermissionsAsync.mockRejectedValueOnce(
    new Error('Permission activity unavailable'),
  );
  runtime.acquire('chat');
  await flush();
  expect(notices.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  setAppState('background');
  setAppState('active');
  await flush();
  expect(notices.requestPermissionsAsync).toHaveBeenCalledTimes(2);
  setAppState('background');
  setAppState('active');
  await flush();
  expect(notices.requestPermissionsAsync).toHaveBeenCalledTimes(2);
});

test('shares the library service across concurrent tasks and stops on the last release', async () => {
  runtime
    .createPresenter<BackgroundReplyActivityProps>()
    .start(props('responding'), 'cherrystudio:///?agentId=a&sessionId=s');
  const chat = runtime.acquire('chat');
  const painting = runtime.acquire('painting');
  await flush();
  expect(native.start).toHaveBeenCalledTimes(1);
  expect(native.start).toHaveBeenCalledWith(
    expect.any(Function),
    expect.objectContaining({
      foregroundServiceType: ['dataSync'],
      taskIcon: { name: 'notification_icon', type: 'drawable' },
    }),
  );
  expect(native.updateNotification).toHaveBeenLastCalledWith(
    expect.objectContaining({ linkingURI: 'cherrystudio:///?agentId=a&sessionId=s' }),
  );
  chat.release();
  chat.release();
  await flush();
  expect(running).toBe(true);
  painting.release();
  await flush();
  expect(running).toBe(false);
  expect(native.stop).toHaveBeenCalledTimes(1);
});

test('work admitted while hidden runs unprotected until the app returns, then continues in background', async () => {
  setAppState('background');
  const interrupted = jest.fn();
  const surface = runtime.createPresenter<BackgroundReplyActivityProps>().start(props('preparing'));
  runtime.acquire('chat', interrupted);
  await flush();
  expect(native.start).not.toHaveBeenCalled();
  expect(interrupted).not.toHaveBeenCalled();
  setAppState('active');
  await flush();
  setAppState('background');
  await surface.update(props('responding'));
  expect(native.start).toHaveBeenCalledTimes(1);
  expect(interrupted).not.toHaveBeenCalled();
  expect(native.updateNotification).toHaveBeenLastCalledWith(
    expect.objectContaining({ taskDesc: 'responding' }),
  );
});

test('notification permission denial does not stop execution and the prompt follows service start', async () => {
  expect(notices.requestPermissionsAsync).not.toHaveBeenCalled();
  runtime.acquire('chat');
  await flush();
  expect(running).toBe(true);
  expect(native.start.mock.invocationCallOrder[0]).toBeLessThan(
    notices.requestPermissionsAsync.mock.invocationCallOrder[0]!,
  );
});

test('the service task cannot later auto-stop a replacement when the old service is released', async () => {
  const first = runtime.acquire('first');
  await flush();
  let completed = false;
  void native.start.mock.calls[0]![0]().then(() => {
    completed = true;
  });
  first.release();
  await flush();
  runtime.acquire('replacement');
  await flush();
  expect(completed).toBe(false);
  expect(running).toBe(true);
  expect(native.stop).toHaveBeenCalledTimes(1);
});

test('cleans abandoned approval notifications while retaining completed and unrelated notices', async () => {
  await runtime._doStop();
  notices.getPresentedNotificationsAsync.mockResolvedValue([
    notice('approval', { owner: BACKGROUND_NOTIFICATION_OWNER, terminal: false }),
    notice('completed', { owner: BACKGROUND_NOTIFICATION_OWNER, terminal: true }),
    notice('unrelated', {}),
  ]);
  runtime = new AndroidBackgroundActivityRuntime(environment);
  await runtime._doInit();
  expect(notices.dismissNotificationAsync).toHaveBeenCalledWith('approval');
  expect(notices.dismissNotificationAsync).not.toHaveBeenCalledWith('completed');
  expect(notices.dismissNotificationAsync).not.toHaveBeenCalledWith('unrelated');
  expect(native.start).not.toHaveBeenCalled();
});

test('the background deadline drains cancellation before stopping and rejects more background work', async () => {
  let finishCancellation!: () => void;
  const interrupted = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        finishCancellation = resolve;
      }),
  );
  runtime.acquire('chat', interrupted);
  await flush();
  setAppState('background');
  jest.advanceTimersByTime(359 * 60_000);
  await flush();
  expect(interrupted).toHaveBeenCalledWith(expect.any(Error));
  expect(running).toBe(true);
  finishCancellation();
  await flush();
  expect(running).toBe(false);
  const queued = jest.fn();
  runtime.acquire('queued', queued);
  await flush();
  expect(queued).toHaveBeenCalledWith(expect.any(Error));
  expect(native.start).toHaveBeenCalledTimes(1);
  setAppState('active');
  runtime.acquire('new-user-task');
  await flush();
  expect(native.start).toHaveBeenCalledTimes(2);
});

test('old deadline cancellation cannot stop work admitted after a foreground budget reset', async () => {
  let finishCancellation!: () => void;
  runtime.acquire(
    'old-task',
    () =>
      new Promise<void>((resolve) => {
        finishCancellation = resolve;
      }),
  );
  await flush();
  setAppState('background');
  jest.advanceTimersByTime(359 * 60_000);
  await flush();

  setAppState('active');
  const newTask = runtime.acquire('new-task');
  await flush();
  setAppState('background');
  finishCancellation();
  await flush();
  expect(running).toBe(true);
  expect(native.stop).not.toHaveBeenCalled();
  expect(native.start).toHaveBeenCalledTimes(1);
  newTask.release();
  await flush();
  expect(running).toBe(false);
});

test('returning to the foreground resets the Android background budget', async () => {
  const interrupted = jest.fn();
  runtime.acquire('chat', interrupted);
  await flush();
  setAppState('background');
  jest.advanceTimersByTime(300 * 60_000);
  setAppState('active');
  setAppState('background');
  jest.advanceTimersByTime(100 * 60_000);
  await flush();
  expect(interrupted).not.toHaveBeenCalled();
});

test('unexpected native destruction interrupts every protected task without restarting in background', async () => {
  const chatInterrupted = jest.fn();
  const paintingInterrupted = jest.fn();
  runtime.acquire('chat', chatInterrupted);
  runtime.acquire('painting', paintingInterrupted);
  await flush();
  setAppState('background');
  running = false;
  for (const listener of serviceStoppedListeners) listener();
  await flush();
  expect(chatInterrupted).toHaveBeenCalledWith(expect.any(Error));
  expect(paintingInterrupted).toHaveBeenCalledWith(expect.any(Error));
  expect(native.start).toHaveBeenCalledTimes(1);
  setAppState('active');
  await flush();
  expect(native.start).toHaveBeenCalledTimes(1);
  runtime.acquire('new-task');
  await flush();
  expect(native.start).toHaveBeenCalledTimes(2);
});

test('expected native interruption does not enter error reporting', async () => {
  const reporter = jest.fn();
  const removeReporter = loggerService.setErrorReporter(reporter);
  try {
    runtime.acquire('chat');
    await flush();
    setAppState('background');
    running = false;
    for (const listener of serviceStoppedListeners) listener();
    await flush();

    expect(reporter).not.toHaveBeenCalled();
  } finally {
    removeReporter();
  }
});

test('a new foreground task survives cancellation draining after native service loss', async () => {
  let finishCancellation!: () => void;
  const cancellation = new Promise<void>((resolve) => {
    finishCancellation = resolve;
  });
  const oldLease = runtime.acquire('old-task', () => cancellation);
  await flush();
  setAppState('background');
  running = false;
  for (const listener of serviceStoppedListeners) listener();
  await flush();
  setAppState('active');
  runtime.acquire('new-task');
  await flush();
  expect(native.start).toHaveBeenCalledTimes(1);
  finishCancellation();
  await flush();
  oldLease.release();
  await flush();
  expect(native.start).toHaveBeenCalledTimes(2);
  expect(running).toBe(true);
  await runtime._doStop();
  expect(serviceStoppedListeners.size).toBe(0);
});

test('one notification identity survives approval, completion, and the next turn', async () => {
  const url = 'cherrystudio:///?sessionId=s';
  const first = runtime
    .createPresenter<BackgroundReplyActivityProps>()
    .start(props('responding'), url);
  const lease = runtime.acquire('chat');
  await flush();
  setAppState('background');
  await first.update(props('awaiting-approval'));
  await first.update(props('responding'));
  await first.end('default', props('completed'));
  lease.release();
  await flush();
  const next = runtime
    .createPresenter<BackgroundReplyActivityProps>()
    .start({ ...props('preparing'), title: 'Next turn' }, url);
  runtime.acquire('next-turn');
  await flush();
  await first.dismiss();
  expect(mockTaskNotifications.size).toBe(1);
  expect([...mockTaskNotifications.values()]).toEqual([{ ongoing: true, title: 'Next turn' }]);
  expect(
    new Set(mockTaskNative.showBackgroundTaskNotification.mock.calls.map(([id]) => id)).size,
  ).toBe(1);
  expect(
    mockTaskNative.showBackgroundTaskNotification.mock.calls.filter((call) => call[5]),
  ).toHaveLength(2);
  await next.end('immediate', props('cancelled'));
});

test('concurrent conversations share execution and each retain one notification', async () => {
  const first = runtime
    .createPresenter<BackgroundReplyActivityProps>()
    .start(props('responding'), 'cherrystudio:///?sessionId=first');
  runtime
    .createPresenter<BackgroundReplyActivityProps>()
    .start(props('responding'), 'cherrystudio:///?sessionId=second');
  runtime.acquire('tasks');
  await flush();
  expect(native.start).toHaveBeenCalledTimes(1);
  expect(mockTaskNotifications.size).toBe(2);
  const secondId = mockTaskIds.get('cherrystudio:///?sessionId=second');
  await first.end('default', props('completed'));
  expect(native.updateNotification).toHaveBeenLastCalledWith(
    expect.objectContaining({
      notificationId: secondId,
      linkingURI: 'cherrystudio:///?sessionId=second',
    }),
  );
  expect(mockTaskNotifications.size).toBe(2);
  expect([...mockTaskNotifications.values()].filter((notice) => notice.ongoing)).toHaveLength(1);
});

test('a finished anchor settles in place before service ownership moves to a survivor', async () => {
  const first = runtime
    .createPresenter<BackgroundReplyActivityProps>()
    .start(props('responding'), 'cherrystudio:///?sessionId=first');
  runtime
    .createPresenter<BackgroundReplyActivityProps>()
    .start(props('responding'), 'cherrystudio:///?sessionId=second');
  runtime.acquire('tasks');
  await flush();
  const firstId = mockTaskIds.get('cherrystudio:///?sessionId=first');
  const secondId = mockTaskIds.get('cherrystudio:///?sessionId=second');
  expect(native.updateNotification).toHaveBeenLastCalledWith(
    expect.objectContaining({ notificationId: firstId, taskOngoing: true }),
  );
  await first.end('default', props('completed'));
  const anchors = native.updateNotification.mock.calls.map(([content]) => content);
  expect(anchors.slice(-2)).toEqual([
    expect.objectContaining({ notificationId: firstId, taskOngoing: false }),
    expect.objectContaining({ notificationId: secondId, taskOngoing: true }),
  ]);
});

test('late operations from a superseded generation cannot overwrite its successor', async () => {
  const url = 'cherrystudio:///?sessionId=s';
  const old = runtime
    .createPresenter<BackgroundReplyActivityProps>()
    .start(props('responding'), url);
  runtime.acquire('old');
  await flush();
  runtime
    .createPresenter<BackgroundReplyActivityProps>()
    .start({ ...props('thinking'), title: 'New generation' }, url);
  await old.end('default', props('failed'));
  await old.dismiss();
  await flush();
  expect([...mockTaskNotifications.values()]).toEqual([{ ongoing: true, title: 'New generation' }]);
});

test('foreground completions remain silent and the completion preference controls alerts only', async () => {
  const first = runtime.createPresenter<BackgroundReplyActivityProps>().start(props('responding'));
  runtime.acquire('chat');
  await first.update(props('completed'));
  setAppState('background');
  await first.end('default', { ...props('completed'), title: 'Late title' });
  expect(mockTaskNative.showBackgroundTaskNotification.mock.calls.some((call) => call[5])).toBe(
    false,
  );
  completionNotificationsEnabled.mockReturnValue(false);
  const second = runtime.createPresenter<BackgroundReplyActivityProps>().start(props('responding'));
  await second.update(props('completed'));
  expect(mockTaskNative.showBackgroundTaskNotification.mock.calls.some((call) => call[5])).toBe(
    false,
  );
  const failed = runtime.createPresenter<BackgroundReplyActivityProps>().start(props('responding'));
  await failed.update(props('failed'));
  expect(
    mockTaskNative.showBackgroundTaskNotification.mock.calls.filter((call) => call[5]),
  ).toHaveLength(1);
  completionNotificationsEnabled.mockReturnValue(true);
});

test('notification submission settles before final delivery resolves', async () => {
  let submit!: () => void;
  mockTaskNative.showBackgroundTaskNotification.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        submit = resolve;
      }),
  );
  const surface = runtime.createPresenter<BackgroundReplyActivityProps>().start(props('completed'));
  let settled = false;
  const delivery = surface.end('default', props('completed')).then(() => {
    settled = true;
  });
  await flush();
  expect(settled).toBe(false);
  submit();
  await delivery;
  expect(settled).toBe(true);
});

test('actual admission failure is observable without cancelling foreground work', async () => {
  native.start.mockRejectedValueOnce(new Error('Admission refused'));
  runtime.acquire('chat');
  await flush();
  expect(runtime.getStatus()).toBe('limited');
  setAppState('background');
  setAppState('active');
  await flush();
  expect(runtime.getStatus()).toBe('active');
});

test('pre-Android-15 execution does not inherit the dataSync timeout', async () => {
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 34 });
  const interrupted = jest.fn();
  runtime.acquire('chat', interrupted);
  await flush();
  setAppState('background');
  jest.advanceTimersByTime(360 * 60_000);
  await flush();
  expect(interrupted).not.toHaveBeenCalled();
});

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

function notice(identifier: string, data: Record<string, unknown>): notifications.Notification {
  return {
    date: 0,
    request: { identifier, trigger: null, content: { data } },
  } as notifications.Notification;
}

function setAppState(state: AppStateStatus): void {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: state });
  for (const listener of listeners) listener(state);
}

async function flush(): Promise<void> {
  for (let index = 0; index < 30; index++) await Promise.resolve();
}
