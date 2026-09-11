import type BackgroundService from 'react-native-background-actions';
import type { BackgroundTaskOptions } from 'react-native-background-actions';

const mockNativeStart = jest.fn<Promise<void>, [BackgroundTaskOptions]>();
const mockNativeStop = jest.fn(async () => {});
const mockNativeUpdate = jest.fn(async () => {});
const mockNativeListeners = new Map<string, (taskName: string) => void>();
const mockHeadlessFactories = new Map<string, () => () => Promise<void>>();
let background: typeof BackgroundService;

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppRegistry: {
    registerHeadlessTask: (name: string, factory: () => () => Promise<void>) => {
      mockHeadlessFactories.set(name, factory);
    },
  },
}));
jest.mock('react-native-background-actions/src/RNBackgroundActionsModule', () => ({
  RNBackgroundActions: {
    start: (options: BackgroundTaskOptions) => mockNativeStart(options),
    stop: () => mockNativeStop(),
    updateNotification: () => mockNativeUpdate(),
  },
  nativeEventEmitter: {
    addListener: (name: string, listener: (taskName: string) => void) => {
      mockNativeListeners.set(name, listener);
    },
  },
}));

const options: BackgroundTaskOptions = {
  taskName: 'Task',
  taskTitle: 'Task',
  taskDesc: 'Running',
  taskIcon: { name: 'notification_icon', type: 'drawable' },
};
const hold = () => new Promise<void>(() => {});

beforeAll(() => {
  background = jest.requireActual<{ default: typeof BackgroundService }>(
    'react-native-background-actions',
  ).default;
});
beforeEach(() => {
  jest.clearAllMocks();
  mockNativeStart.mockResolvedValue(undefined);
});
afterEach(async () => {
  await background.stop();
  background.removeAllListeners('stopped');
  mockHeadlessFactories.clear();
});

test('unexpected destruction resets running state before interrupting and finishes the headless task', async () => {
  const observedRunning: boolean[] = [];
  background.on('stopped', () => observedRunning.push(background.isRunning()));
  await background.start(hold, options);
  const taskName = mockNativeStart.mock.calls[0]![0].taskName;
  const task = mockHeadlessFactories.get(taskName)!()();
  await background.updateNotification({ taskTitle: 'Updated' });
  mockNativeListeners.get('stopped')?.(taskName);
  expect(observedRunning).toEqual([false]);
  await task;
  expect(mockNativeStop).not.toHaveBeenCalled();
});

test('expected stops and late events from an older service cannot interrupt a newer task', async () => {
  const interrupted = jest.fn();
  background.on('stopped', interrupted);
  await background.start(hold, options);
  const oldName = mockNativeStart.mock.calls[0]![0].taskName;
  await background.stop();
  mockNativeListeners.get('stopped')?.(oldName);
  expect(interrupted).not.toHaveBeenCalled();
  await background.start(hold, options);
  mockNativeListeners.get('stopped')?.(oldName);
  expect(background.isRunning()).toBe(true);
  expect(interrupted).not.toHaveBeenCalled();
  const delayedOldTask = mockHeadlessFactories.get(oldName)!()();
  await delayedOldTask;
  expect(background.isRunning()).toBe(true);
});

test('a stop arriving before the start promise resolves cannot restore a stale running flag', async () => {
  let finishStart!: () => void;
  mockNativeStart.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishStart = resolve;
      }),
  );
  const starting = background.start(hold, options);
  const rejected = expect(starting).rejects.toThrow('Background service stopped while starting');
  const taskName = mockNativeStart.mock.calls[0]![0].taskName;
  mockNativeListeners.get('stopped')?.(taskName);
  finishStart();
  await rejected;
  expect(background.isRunning()).toBe(false);
});
