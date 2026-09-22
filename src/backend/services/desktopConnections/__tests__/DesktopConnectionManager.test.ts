import type { RemoteAuthorization } from '@cherrystudio/remote-protocol';
import { AppState, type AppStateStatus } from 'react-native';

import type { DesktopConnectionRow } from '@/backend/data/db/schemas';

import { DesktopConnectionManager } from '../DesktopConnectionManager';
import { DesktopSession } from '../DesktopSession';

jest.mock('@cherrystudio/remote-transport', () => ({}));
jest.mock('../deviceIdentity', () => ({
  loadDeviceIdentity: jest.fn(async () => new Uint8Array(32)),
}));
jest.mock('../DesktopSession', () => ({
  ...jest.requireActual('../DesktopSession'),
  DesktopSession: { connect: jest.fn() },
}));

const grants: RemoteAuthorization['grants'] = [
  { domain: 'configuration', grantId: 'config-1' },
  { domain: 'agent', grantId: 'agent-1' },
];
const original: DesktopConnectionRow = {
  id: 'desktop-1',
  name: 'Desktop',
  deviceId: 'device-1',
  desktopIdentity: 'peer-1',
  addresses: ['192.168.1.2'],
  port: 23333,
  grants,
  status: 'paired',
  lastFetchedAt: null,
  createdAt: 1,
  updatedAt: 1,
};
const signal = () => new AbortController().signal;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function session(authorization = { grants }) {
  const done = deferred<void>();
  const listeners = new Set<(value: RemoteAuthorization) => void>();
  const channel = {
    isOpen: true,
    done: done.promise,
    currentAuthorization: authorization,
    authenticate: jest.fn(async () => authorization),
    onAuthorization: (listener: (value: RemoteAuthorization) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: jest.fn(() => {
      channel.isOpen = false;
      done.resolve();
    }),
    refresh: (value: RemoteAuthorization) => {
      channel.currentAuthorization = value;
      for (const listener of listeners) listener(value);
    },
  };
  return channel;
}

describe('DesktopConnectionManager ownership', () => {
  let manager: DesktopConnectionManager;
  let row: DesktopConnectionRow;
  let appState: (state: AppStateStatus) => void;
  const connect = jest.mocked(DesktopSession.connect);
  let store: { getRow: jest.Mock; updateStatus: jest.Mock };
  beforeEach(async () => {
    jest.resetAllMocks();
    jest.useFakeTimers();
    AppState.currentState = 'active';
    jest.mocked(AppState.addEventListener).mockImplementation((_event, listener) => {
      appState = listener;
      return { remove: jest.fn() };
    });
    row = { ...original };
    store = {
      getRow: jest.fn(async () => row),
      updateStatus: jest.fn(async (_id, input, signal, expected) => {
        signal.throwIfAborted();
        if (
          expected &&
          (row.deviceId !== expected.deviceId ||
            row.desktopIdentity !== expected.desktopIdentity ||
            JSON.stringify(row.grants) !== JSON.stringify(expected.grants))
        )
          throw new Error('Pairing replaced');
        row = { ...row, ...input };
      }),
    };
    manager = new DesktopConnectionManager();
    manager.configure(store);
    await manager._doInit();
  });
  afterEach(async () => {
    await manager._doStop();
    await manager._doDestroy();
    jest.useRealTimers();
  });

  it('does not dial at startup and shares a channel without cancelling another domain on release', async () => {
    expect(connect).not.toHaveBeenCalled();
    const channel = session();
    connect.mockResolvedValue(channel as never);
    const [agent, config] = await Promise.all([
      manager.retain(row.id, 'agent', signal()),
      manager.retain(row.id, 'configuration', signal()),
    ]);
    expect(await agent.ready(signal())).toBe(await config.ready(signal()));
    expect(connect).toHaveBeenCalledTimes(1);
    agent.release();
    await jest.advanceTimersByTimeAsync(4000);
    expect(channel.close).not.toHaveBeenCalled();
    expect(config.getSnapshot().status).toBe('ready');
    config.release();
    await jest.advanceTimersByTimeAsync(3000);
    expect(channel.close).toHaveBeenCalledTimes(1);
  });

  it('retires only the revoked domain before its persistence finishes', async () => {
    const channel = session();
    connect.mockResolvedValue(channel as never);
    const agent = await manager.retain(row.id, 'agent', signal());
    const config = await manager.retain(row.id, 'configuration', signal());
    await agent.ready(signal());
    const write = deferred<void>();
    store.updateStatus.mockImplementationOnce(async () => write.promise);
    const revocation = manager.revoke(row.id, 'agent', agent.grantId);
    expect(agent.signal.aborted).toBe(true);
    expect(config.signal.aborted).toBe(false);
    expect(await config.ready(signal())).toBe(channel);
    expect(channel.close).not.toHaveBeenCalled();
    write.resolve();
    await revocation;
    expect(store.updateStatus).toHaveBeenLastCalledWith(
      row.id,
      {
        grants: [grants[0]],
        status: 'paired',
      },
      expect.any(AbortSignal),
      expect.objectContaining({ grants }),
    );
  });

  it('does not resurrect a revoked grant from a late refresh while keeping configuration usable', async () => {
    const channel = session();
    connect.mockResolvedValue(channel as never);
    const agent = await manager.retain(row.id, 'agent', signal());
    const config = await manager.retain(row.id, 'configuration', signal());
    await agent.ready(signal());
    await manager.revoke(row.id, 'agent', agent.grantId);
    channel.refresh({ grants });
    await jest.advanceTimersByTimeAsync(0);
    expect(row.grants).toEqual([grants[0]]);
    await expect(manager.retain(row.id, 'agent', signal())).rejects.toMatchObject({
      reason: 'FORBIDDEN',
    });
    expect(await config.ready(signal())).toBe(channel);
  });

  it('suspends all physical channels and reconnects retained consumers on foreground', async () => {
    const first = session();
    const next = session();
    connect.mockResolvedValueOnce(first as never).mockResolvedValueOnce(next as never);
    const agent = await manager.retain(row.id, 'agent', signal());
    await agent.ready(signal());
    appState('background');
    expect(first.close).toHaveBeenCalled();
    expect(agent.getSnapshot().status).toBe('suspended');
    await jest.advanceTimersByTimeAsync(30_000);
    expect(connect).toHaveBeenCalledTimes(1);
    appState('active');
    expect(await agent.ready(signal())).toBe(next);
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('does not let a dial arriving after pairing replacement overwrite the new credentials', async () => {
    const dial = deferred<DesktopSession>();
    const old = session();
    connect.mockReturnValueOnce(dial.promise);
    const lease = await manager.retain(row.id, 'agent', signal());
    await jest.advanceTimersByTimeAsync(0);
    expect(connect).toHaveBeenCalledTimes(1);
    row = { ...row, deviceId: 'replacement', grants: [{ domain: 'agent', grantId: 'agent-2' }] };
    manager.invalidate(row.id);
    dial.resolve(old as never);
    await jest.advanceTimersByTimeAsync(0);
    expect(lease.signal.aborted).toBe(true);
    expect(old.close).toHaveBeenCalled();
    expect(store.updateStatus).not.toHaveBeenCalled();
    expect(row.deviceId).toBe('replacement');
  });

  it('closes a temporary pairing channel returned after the caller aborted', async () => {
    const dial = deferred<DesktopSession>();
    const channel = session();
    connect.mockReturnValueOnce(dial.promise);
    const caller = new AbortController();
    const opening = manager.connectTemporary(original, caller.signal);
    const rejected = expect(opening).rejects.toMatchObject({ name: 'AbortError' });
    await jest.advanceTimersByTimeAsync(0);
    caller.abort();
    dial.resolve(channel as never);
    await rejected;
    expect(channel.close).toHaveBeenCalledTimes(1);
  });
});
