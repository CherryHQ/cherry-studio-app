import { Platform } from 'react-native';

import type { AndroidBackgroundActivityRuntime } from '@/backend/services/backgroundActivity/AndroidBackgroundActivityRuntime';
import type { BackgroundActivityEnvironment } from '@/backend/services/backgroundActivity/BackgroundActivityEnvironment';
import type { KeepAliveCoordinator } from '@/backend/services/keepAlive/KeepAliveCoordinator';
import type { BackgroundActivityActionResponse } from '@/shared/backgroundActivity/actions';

import type { PersistentDesktopConnection } from '../connectionPorts';
import type { DesktopConnectionManager } from '../DesktopConnectionManager';
import { RemoteConnectionNotificationRuntime } from '../RemoteConnectionNotificationRuntime';

jest.mock('expo-linking', () => ({ resolveScheme: () => 'cherrystudio-dev' }));

let connections: PersistentDesktopConnection[];
let changed: () => void;
let action: (response: BackgroundActivityActionResponse) => void;
let interrupted: () => void;
const release = jest.fn();
const acquire = jest.fn((_tag: string, interrupt: () => void) => {
  interrupted = interrupt;
  return { release };
});
const notifications = jest.fn(async () => {});
const disconnect = jest.fn((id: string) => {
  connections = connections.filter((item) => item.id !== id);
  changed();
});
let runtime: RemoteConnectionNotificationRuntime;

beforeEach(async () => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  connections = [];
  runtime = new RemoteConnectionNotificationRuntime(
    {
      enablePersistentConnections() {},
      getPersistentConnections: () => connections,
      subscribeConnections: (listener: () => void) => {
        changed = listener;
        return () => {};
      },
      disconnect,
    } as unknown as DesktopConnectionManager,
    { acquire } as unknown as KeepAliveCoordinator,
    { setRemoteConnections: notifications } as unknown as AndroidBackgroundActivityRuntime,
    {
      translate: (key: string) => key,
      subscribeActions: (listener: typeof action) => {
        action = listener;
        return () => {};
      },
    } as unknown as BackgroundActivityEnvironment,
  );
  await runtime._doInit();
});

afterEach(async () => {
  await runtime._doStop();
});

function connect(token = 'generation-1') {
  connections = [{ id: 'pc 1', name: 'Desktop', token, status: 'connected' }];
  changed();
}

test('a current disconnect releases the connection while a stale card cannot disconnect its replacement', () => {
  connect();
  expect(notifications).toHaveBeenLastCalledWith([
    expect.objectContaining({
      url: 'cherrystudio-dev://remote?connectionId=pc%201',
      token: 'generation-1',
    }),
  ]);
  action({ token: 'unrelated-task', actionId: 'disconnect' });
  expect(disconnect).not.toHaveBeenCalled();
  action({ token: 'generation-1', actionId: 'disconnect' });
  expect(connections).toEqual([]);
  expect(release).toHaveBeenCalledTimes(1);
  expect(notifications).toHaveBeenLastCalledWith([]);
  connect('generation-2');
  action({ token: 'generation-1', actionId: 'disconnect' });
  expect(connections).toHaveLength(1);
  action({ token: 'generation-2', actionId: 'disconnect' });
  expect(connections).toEqual([]);
  expect(release).toHaveBeenCalledTimes(2);
});

test('platform expiry disconnects every PC and does not reacquire protection during cleanup', () => {
  connect();
  connections.push({ id: 'pc 2', name: 'Second PC', token: 'second', status: 'connecting' });
  changed();
  interrupted();
  expect(connections).toEqual([]);
  expect(disconnect.mock.calls.map(([id]) => id)).toEqual(['pc 1', 'pc 2']);
  expect(acquire).toHaveBeenCalledTimes(1);
  expect(notifications).toHaveBeenLastCalledWith([]);
});

test('unchanged connection snapshots neither post a notice nor acquire another lease', () => {
  connect();
  const count = notifications.mock.calls.length;
  changed();
  expect(notifications.mock.calls.length).toBe(count);
  expect(acquire).toHaveBeenCalledTimes(1);
});

test('host disposal removes its notice and ignores late button delivery', async () => {
  connect();
  await runtime._doStop();
  action({ token: 'generation-1', actionId: 'disconnect' });
  expect(disconnect).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledTimes(1);
  expect(notifications).toHaveBeenLastCalledWith([]);
});
