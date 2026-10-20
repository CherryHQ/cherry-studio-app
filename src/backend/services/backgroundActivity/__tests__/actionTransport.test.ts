import { Platform } from 'react-native';

import { BACKGROUND_NOTIFICATION_OWNER } from '@/shared/backgroundActivity/types';

import { subscribeBackgroundActivityActions } from '../actionTransport';

const mockRemove = jest.fn();
const mockNative = {
  drainBackgroundTaskActions: jest.fn(async (): Promise<unknown[]> => []),
  addListener: jest.fn((_event: string, _listener: () => void) => ({ remove: mockRemove })),
};
const mockNotifications = {
  DEFAULT_ACTION_IDENTIFIER: 'default',
  addNotificationResponseReceivedListener: jest.fn((_listener: (value: unknown) => void) => ({
    remove: mockRemove,
  })),
  getLastNotificationResponse: jest.fn(() => null),
  clearLastNotificationResponse: jest.fn(),
};
const mockWidgets = {
  addUserInteractionListener: jest.fn((_listener: (value: unknown) => void) => ({
    remove: mockRemove,
  })),
};
jest.mock('../../../../../modules/system-integration', () => ({
  getSystemIntegration: () => mockNative,
}));
jest.mock('expo-notifications', () => mockNotifications);
jest.mock('expo-widgets', () => mockWidgets);

beforeEach(() => {
  jest.clearAllMocks();
  mockNative.drainBackgroundTaskActions.mockResolvedValue([]);
});

test('Android drains queued decisions on subscription and serializes native event drains', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  let complete!: (items: unknown[]) => void;
  mockNative.drainBackgroundTaskActions.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  mockNative.drainBackgroundTaskActions.mockResolvedValueOnce([
    { token: 'next', actionId: 'reply', text: 'snow' },
    { token: 'invalid', actionId: 1 },
  ]);
  const listener = jest.fn();
  const dispose = subscribeBackgroundActivityActions(listener);
  await flush();
  mockNative.addListener.mock.calls[0]![1]();
  await flush();
  expect(mockNative.drainBackgroundTaskActions).toHaveBeenCalledTimes(1);
  complete([{ token: 'first', actionId: 'approve' }]);
  await flush();
  expect(listener.mock.calls).toEqual([
    [{ token: 'first', actionId: 'approve' }],
    [{ token: 'next', actionId: 'reply', text: 'snow' }],
  ]);
  dispose();
  expect(mockRemove).toHaveBeenCalledTimes(1);
});

test('a disposed Android subscription leaves its queued inbox drain for the next owner', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  const listener = jest.fn();
  const dispose = subscribeBackgroundActivityActions(listener);
  dispose();
  await flush();
  expect(mockNative.drainBackgroundTaskActions).not.toHaveBeenCalled();
  expect(listener).not.toHaveBeenCalled();
});

test('iOS forwards owned notification and Live Activity controls and ignores ordinary opens', () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  const listener = jest.fn();
  const dispose = subscribeBackgroundActivityActions(listener);
  const receiveNotice = mockNotifications.addNotificationResponseReceivedListener.mock.calls[0]![0];
  const event = {
    notification: {
      request: {
        content: { data: { owner: BACKGROUND_NOTIFICATION_OWNER, actionToken: 'question' } },
      },
    },
    actionIdentifier: 'reply',
    userText: 'snow',
  };
  receiveNotice({ ...event, actionIdentifier: 'default' });
  receiveNotice(event);
  const receiveWidget = mockWidgets.addUserInteractionListener.mock.calls[0]![0];
  receiveWidget({ source: 'OtherWidget', target: '__expo_widgets_target_1' });
  receiveWidget({
    source: '01454CA2-1D7D-458A-AAEC-9C572A3419E2',
    target: '{"token":"approval","actionId":"deny"}',
  });
  expect(listener.mock.calls).toEqual([
    [{ token: 'question', actionId: 'reply', text: 'snow' }],
    [{ token: 'approval', actionId: 'deny' }],
  ]);
  expect(mockNotifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
  dispose();
  expect(mockRemove).toHaveBeenCalledTimes(2);
});

async function flush() {
  for (let index = 0; index < 12; index++) await Promise.resolve();
}
