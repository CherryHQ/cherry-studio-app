import * as notifications from 'expo-notifications';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import background from 'react-native-background-actions';

import type { BackgroundReplyActivityProps } from '@/shared/backgroundActivity/chatReply';
import { BACKGROUND_NOTIFICATION_OWNER } from '@/shared/backgroundActivity/types';

import { AndroidBackgroundActivityRuntime } from '../AndroidBackgroundActivityRuntime';

jest.mock('react-native-background-actions', () => ({
  __esModule: true,
  default: {
    isRunning: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    updateNotification: jest.fn(),
  },
}));
jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
  dismissNotificationAsync: jest.fn(async () => {}),
  getPresentedNotificationsAsync: jest.fn(async () => []),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async ({ identifier }: { identifier: string }) => identifier),
  setNotificationChannelAsync: jest.fn(async () => {}),
  setNotificationHandler: jest.fn(),
}));

const native = jest.mocked(background);
const notices = jest.mocked(notifications);
const foregroundAttention = jest.fn();
const environment = { translate: (key: string) => key, onForegroundAttention: foregroundAttention };
let running: boolean;
let runtime: AndroidBackgroundActivityRuntime;
const listeners = new Set<(state: AppStateStatus) => void>();

beforeEach(async () => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  running = false;
  listeners.clear();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  setAppState('active');
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  native.isRunning.mockImplementation(() => running);
  native.start.mockImplementation(async () => {
    running = true;
  });
  native.stop.mockImplementation(async () => {
    running = false;
  });
  native.updateNotification.mockResolvedValue(undefined);
  notices.getPresentedNotificationsAsync.mockResolvedValue([]);
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

test('starts only while visible and continues updating after backgrounding', async () => {
  setAppState('background');
  const surface = runtime.createPresenter<BackgroundReplyActivityProps>().start(props('preparing'));
  runtime.acquire('chat');
  await flush();
  expect(native.start).not.toHaveBeenCalled();
  setAppState('active');
  await flush();
  setAppState('background');
  await surface.update(props('responding'));
  expect(native.start).toHaveBeenCalledTimes(1);
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

test('delivers completion once and does not repost it when a final title arrives', async () => {
  const surface = runtime
    .createPresenter<BackgroundReplyActivityProps>()
    .start(props('responding'));
  runtime.acquire('chat');
  await flush();
  setAppState('background');
  await surface.update(props('completed'));
  await surface.end('default', { ...props('completed'), title: 'Final title' });
  expect(notices.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  expect(notices.scheduleNotificationAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.objectContaining({ data: expect.objectContaining({ terminal: true }) }),
      trigger: { channelId: 'generation-updates' },
    }),
  );
});

test('withdraws an approval notification on resume and allows a later completion notification', async () => {
  const surface = runtime
    .createPresenter<BackgroundReplyActivityProps>()
    .start(props('responding'));
  runtime.acquire('chat');
  await flush();
  setAppState('background');
  await surface.update(props('awaiting-approval'));
  const id = notices.scheduleNotificationAsync.mock.calls[0]![0].identifier;
  await surface.update(props('responding'));
  expect(notices.dismissNotificationAsync).toHaveBeenCalledWith(id);
  await surface.end('default', props('completed'));
  expect(notices.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
});

test('completion in the foreground is not announced later while waiting for a title', async () => {
  const surface = runtime
    .createPresenter<BackgroundReplyActivityProps>()
    .start(props('responding'));
  await surface.update(props('completed'));
  setAppState('background');
  await surface.end('default', props('completed'));
  expect(notices.scheduleNotificationAsync).not.toHaveBeenCalled();
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

test('foreground approvals and failures use in-app attention while completion stays silent', async () => {
  const surface = runtime
    .createPresenter<BackgroundReplyActivityProps>()
    .start(props('responding'), 'cherrystudio:///?sessionId=s');
  await surface.update(props('awaiting-approval'));
  expect(foregroundAttention).toHaveBeenLastCalledWith(
    expect.objectContaining({ phase: 'awaiting-approval', url: 'cherrystudio:///?sessionId=s' }),
  );
  await surface.update(props('responding'));
  await surface.update(props('failed'));
  await surface.end('default', { ...props('failed'), title: 'Late title' });
  expect(foregroundAttention).toHaveBeenCalledTimes(2);
  expect(foregroundAttention).toHaveBeenLastCalledWith(
    expect.objectContaining({ phase: 'failed' }),
  );
  const completed = runtime
    .createPresenter<BackgroundReplyActivityProps>()
    .start(props('responding'));
  await completed.end('default', props('completed'));
  expect(foregroundAttention).toHaveBeenCalledTimes(2);
  expect(notices.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('a queued foreground completion is not announced after the app backgrounds', async () => {
  const surface = runtime
    .createPresenter<BackgroundReplyActivityProps>()
    .start(props('responding'));
  const delivery = surface.update(props('completed'));
  setAppState('background');
  await delivery;
  await surface.end('default', props('completed'));
  expect(notices.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('returning before queued background delivery suppresses the system alert', async () => {
  const surface = runtime
    .createPresenter<BackgroundReplyActivityProps>()
    .start(props('responding'));
  setAppState('background');
  const delivery = surface.end('default', props('completed'));
  setAppState('active');
  await delivery;
  expect(notices.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('honors foreground phase entry even when the manager invokes delivery from the background', async () => {
  const surface = runtime
    .createPresenter<BackgroundReplyActivityProps>()
    .start(props('responding'));
  setAppState('background');
  await surface.end('default', props('completed'), { phaseStartedInBackground: false });
  expect(notices.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('an aggregate restores the app and becomes task-specific again when one task remains', async () => {
  const first = runtime
    .createPresenter<BackgroundReplyActivityProps>()
    .start(props('responding'), 'cherrystudio:///?sessionId=first');
  runtime
    .createPresenter<BackgroundReplyActivityProps>()
    .start(props('responding'), 'cherrystudio:///?sessionId=second');
  runtime.acquire('tasks');
  await flush();
  expect(native.updateNotification).toHaveBeenLastCalledWith(
    expect.objectContaining({ linkingURI: undefined }),
  );
  await first.end('immediate', props('cancelled'));
  expect(native.updateNotification).toHaveBeenLastCalledWith(
    expect.objectContaining({ linkingURI: 'cherrystudio:///?sessionId=second' }),
  );
  expect(notices.scheduleNotificationAsync).not.toHaveBeenCalled();
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
