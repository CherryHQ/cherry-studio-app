import { directEndpointUrl, type RemoteAuthorization } from '@cherrystudio/remote-protocol';
import { AppState, type AppStateStatus } from 'react-native';

import type { DesktopConnectionRow } from '@/backend/data/db/schemas';

import { DesktopConnectionManager } from '../DesktopConnectionManager';
import type { DiscoveryEvent } from '../DesktopEndpointResolver';
import { DesktopSession, RemoteFailureError } from '../DesktopSession';
import { openWebSocketStream } from '../remoteSocket';

let mockDiscoveryReceive: (event: DiscoveryEvent) => void;

jest.mock('@cherrystudio/remote-transport', () => ({}));
jest.mock('../remoteSocket', () => ({ openWebSocketStream: jest.fn() }));
jest.mock('../desktopDiscovery', () => ({
  DesktopDiscovery: class {
    constructor(receive: (event: DiscoveryEvent) => void) {
      mockDiscoveryReceive = receive;
    }
    setActive() {}
    browse() {
      return () => {};
    }
  },
}));
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
  desktopIdentity: 'peer1',
  learnedEndpoints: [],
  configuredEndpoints: [{ host: '192.168.1.2', port: 23333, security: 'ws' as const }],
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
  let store: { getRow: jest.Mock; updateStatus: jest.Mock; updateLearnedEndpoints: jest.Mock };
  beforeEach(async () => {
    jest.resetAllMocks();
    jest.mocked(openWebSocketStream).mockImplementation(async () => ({ abort() {} }) as never);
    jest.useFakeTimers();
    AppState.currentState = 'active';
    jest.mocked(AppState.addEventListener).mockImplementation((_event, listener) => {
      appState = listener;
      return { remove: jest.fn() };
    });
    row = { ...original, configuredEndpoints: [...original.configuredEndpoints] };
    store = {
      getRow: jest.fn(async () => row),
      updateLearnedEndpoints: jest.fn(async (_id, endpoints, expected, signal) => {
        signal.throwIfAborted();
        if (row.deviceId !== expected.deviceId) throw new Error('Pairing replaced');
        row = { ...row, learnedEndpoints: endpoints };
        return endpoints;
      }),
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

  it('reconnects over a synced VPN address after network changes clear QR hints', async () => {
    const vpn = { host: '100.64.0.2', port: 23333, security: 'ws' as const };
    row.configuredEndpoints = [];
    manager.seedLocation(row.id, row.desktopIdentity, original.configuredEndpoints);
    const first = Object.assign(session(), {
      connectionEndpointsVersion: 1,
      request: async () => ({ desktopIdentity: row.desktopIdentity, endpoints: [vpn] }),
    });
    connect.mockResolvedValueOnce(first as never);
    const lease = await manager.retain(row.id, 'agent', signal());
    await expect(lease.ready(signal())).resolves.toBe(first);
    await jest.advanceTimersByTimeAsync(0);
    expect(row.learnedEndpoints).toEqual([vpn]);
    const next = session();
    connect.mockResolvedValueOnce(next as never);
    first.close();
    await jest.advanceTimersByTimeAsync(0);
    mockDiscoveryReceive({ type: 'network' });
    await jest.advanceTimersByTimeAsync(0);
    await expect(lease.ready(signal())).resolves.toBe(next);
    expect(jest.mocked(openWebSocketStream).mock.calls.map(([url]) => url)).toEqual([
      'ws://192.168.1.2:23333/v1/remote/connect',
      'ws://100.64.0.2:23333/v1/remote/connect',
    ]);
    expect(row.grants).toEqual(grants);
  });

  it('loads synced addresses on a fresh manager without discovery or another pairing', async () => {
    const vpn = { host: 'fd7a:115c:a1e0::2', port: 23333, security: 'ws' as const };
    row.configuredEndpoints = [];
    row.learnedEndpoints = [vpn];
    const channel = session();
    connect.mockResolvedValueOnce(channel as never);
    const lease = await manager.retain(row.id, 'agent', signal());
    await expect(lease.ready(signal())).resolves.toBe(channel);
    expect(jest.mocked(openWebSocketStream).mock.calls.map(([url]) => url)).toEqual([
      'ws://[fd7a:115c:a1e0::2]:23333/v1/remote/connect',
    ]);
    expect(row.learnedEndpoints).toEqual([vpn]);
  });

  it.each(['request failure', 'wrong identity'])(
    'keeps a healthy connection and saved routes after sync %s',
    async (failure) => {
      const vpn = { host: '100.64.0.2', port: 23333, security: 'ws' as const };
      row.learnedEndpoints = [vpn];
      const channel = Object.assign(session(), {
        connectionEndpointsVersion: 1,
        request: async () => {
          if (failure === 'request failure') throw new Error('Address query failed');
          return { desktopIdentity: 'other-desktop', endpoints: [] };
        },
      });
      connect.mockResolvedValueOnce(channel as never);
      const lease = await manager.retain(row.id, 'agent', signal());
      await expect(lease.ready(signal())).resolves.toBe(channel);
      await jest.advanceTimersByTimeAsync(0);
      expect(channel.isOpen).toBe(true);
      expect(lease.getSnapshot().status).toBe('ready');
      expect(row.learnedEndpoints).toEqual([vpn]);
      expect(row.status).toBe('paired');
    },
  );

  it('does not save an address response from a closed session', async () => {
    const reply = deferred<{
      desktopIdentity: string;
      endpoints: typeof original.configuredEndpoints;
    }>();
    const channel = Object.assign(session(), {
      connectionEndpointsVersion: 1,
      request: () => reply.promise,
    });
    connect.mockResolvedValueOnce(channel as never);
    const lease = await manager.retain(row.id, 'agent', signal());
    await lease.ready(signal());
    channel.close();
    await jest.advanceTimersByTimeAsync(0);
    reply.resolve({
      desktopIdentity: row.desktopIdentity,
      endpoints: original.configuredEndpoints,
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(row.learnedEndpoints).toEqual([]);
  });

  it('retries learned routes when discovery is unavailable instead of waiting for another scan', async () => {
    row.configuredEndpoints = [];
    row.learnedEndpoints = [{ host: '100.64.0.2', port: 23333, security: 'ws' }];
    mockDiscoveryReceive({ type: 'unavailable' });
    jest.mocked(openWebSocketStream).mockRejectedValueOnce(new Error('Network unavailable'));
    const lease = await manager.retain(row.id, 'agent', signal());
    await expect(lease.ready(signal())).rejects.toMatchObject({ reason: 'unreachable' });
    const channel = session();
    connect.mockResolvedValueOnce(channel as never);
    await jest.advanceTimersByTimeAsync(1_000);
    await expect(lease.ready(signal())).resolves.toBe(channel);
    expect(jest.mocked(openWebSocketStream).mock.calls.map(([url]) => url)).toEqual([
      'ws://100.64.0.2:23333/v1/remote/connect',
      'ws://100.64.0.2:23333/v1/remote/connect',
    ]);
  });

  it('reports missing addresses immediately when discovery is unavailable and waits for a new route', async () => {
    row.configuredEndpoints = [];
    mockDiscoveryReceive({ type: 'unavailable' });
    const lease = await manager.retain(row.id, 'agent', signal());
    await expect(lease.ready(signal())).rejects.toMatchObject({ reason: 'discovery-unavailable' });
    expect(lease.getSnapshot()).toEqual({ status: 'offline', reason: 'discovery-unavailable' });
    await jest.advanceTimersByTimeAsync(60_000);
    expect(lease.getSnapshot()).toEqual({ status: 'offline', reason: 'discovery-unavailable' });
    expect(openWebSocketStream).not.toHaveBeenCalled();

    const channel = session();
    connect.mockResolvedValueOnce(channel as never);
    row.configuredEndpoints = [{ host: '100.64.0.2', port: 23333, security: 'ws' }];
    await manager.refreshEndpoints(row.id);
    await expect(lease.ready(signal())).resolves.toBe(channel);
    expect(openWebSocketStream).toHaveBeenCalledWith(
      directEndpointUrl(row.configuredEndpoints[0]),
      expect.any(AbortSignal),
    );
  });

  it('retains a missing-address reason during bounded discovery retries and recovers from a new hint', async () => {
    row.configuredEndpoints = [];
    const lease = await manager.retain(row.id, 'agent', signal());
    const ready = expect(lease.ready(signal())).rejects.toMatchObject({ reason: 'no-location' });
    await jest.advanceTimersByTimeAsync(15_000);
    await ready;
    await jest.advanceTimersByTimeAsync(1_000);
    expect(lease.getSnapshot()).toEqual({ status: 'connecting', reason: 'no-location' });

    const channel = session();
    connect.mockResolvedValueOnce(channel as never);
    manager.seedLocation(row.id, row.desktopIdentity, [original.configuredEndpoints[0]]);
    await expect(lease.ready(signal())).resolves.toBe(channel);
  });

  it('wakes a missing-address connection when automatic discovery recovers', async () => {
    row.configuredEndpoints = [];
    mockDiscoveryReceive({ type: 'unavailable' });
    const lease = await manager.retain(row.id, 'agent', signal());
    await expect(lease.ready(signal())).rejects.toMatchObject({ reason: 'discovery-unavailable' });
    const channel = session();
    connect.mockResolvedValueOnce(channel as never);
    mockDiscoveryReceive({
      type: 'service',
      id: 'desktop.local',
      txt: { v: '1', identity: row.desktopIdentity },
      hosts: ['10.0.0.2'],
      port: 23333,
    });
    await expect(lease.ready(signal())).resolves.toBe(channel);
  });

  it('allows bounded discovery again after a foreground transition from an unavailable network', async () => {
    row.configuredEndpoints = [];
    mockDiscoveryReceive({ type: 'unavailable' });
    const lease = await manager.retain(row.id, 'agent', signal());
    await expect(lease.ready(signal())).rejects.toMatchObject({ reason: 'discovery-unavailable' });
    appState('background');
    appState('active');
    await jest.advanceTimersByTimeAsync(0);
    expect(lease.getSnapshot().status).toBe('connecting');
    const channel = session();
    connect.mockResolvedValueOnce(channel as never);
    mockDiscoveryReceive({
      type: 'service',
      id: 'desktop.local',
      txt: { v: '1', identity: row.desktopIdentity },
      hosts: ['10.0.0.2'],
      port: 23333,
    });
    await expect(lease.ready(signal())).resolves.toBe(channel);
  });

  it.each([
    { host: '100.64.0.2', port: 24444, security: 'ws' as const },
    { host: 'fd00::2', port: 24444, security: 'ws' as const },
    { host: 'desktop.example', port: 443, security: 'wss' as const },
  ])(
    'tests $host independently of a healthy channel and authenticates the paired identity',
    async (endpoint) => {
      const active = session();
      const checked = session();
      connect.mockResolvedValueOnce(active as never).mockResolvedValueOnce(checked as never);
      const lease = await manager.retain(row.id, 'agent', signal());
      await lease.ready(signal());
      await manager.testEndpoint(row.id, endpoint, signal());
      expect(openWebSocketStream).toHaveBeenLastCalledWith(
        directEndpointUrl(endpoint),
        expect.any(AbortSignal),
      );
      expect(connect).toHaveBeenLastCalledWith(
        expect.objectContaining({
          address: endpoint.host,
          desktopIdentity: row.desktopIdentity,
        }),
      );
      expect(checked.authenticate).toHaveBeenCalledWith(row.deviceId, expect.any(AbortSignal));
      expect(checked.close).toHaveBeenCalled();
      expect(active.close).not.toHaveBeenCalled();
      expect(lease.getSnapshot().status).toBe('ready');
      expect(row.configuredEndpoints).toEqual(original.configuredEndpoints);
    },
  );

  it('does not report a tested address as connected when pairing authentication fails', async () => {
    const checked = session();
    checked.authenticate.mockRejectedValueOnce(
      new RemoteFailureError({ reason: 'UNAUTHENTICATED', message: 'Unknown phone' }),
    );
    connect.mockResolvedValueOnce(checked as never);
    await expect(
      manager.testEndpoint(row.id, original.configuredEndpoints[0], signal()),
    ).rejects.toMatchObject({ reason: 'UNAUTHENTICATED' });
    expect(checked.close).toHaveBeenCalled();
    expect(store.updateStatus).not.toHaveBeenCalled();
  });

  it('bounds an endpoint check that never completes its handshake', async () => {
    connect.mockImplementationOnce(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );
    const failed = expect(
      manager.testEndpoint(row.id, original.configuredEndpoints[0], signal()),
    ).rejects.toMatchObject({ reason: 'unreachable' });
    await jest.advanceTimersByTimeAsync(6_000);
    await failed;
  });

  it('does not reuse a healthy route when the requested address fails to open', async () => {
    const active = session();
    connect.mockResolvedValueOnce(active as never);
    const lease = await manager.retain(row.id, 'agent', signal());
    await lease.ready(signal());
    jest.mocked(openWebSocketStream).mockRejectedValueOnce(new Error('Address unreachable'));
    await expect(
      manager.testEndpoint(row.id, { host: '100.64.0.2', port: 24444, security: 'ws' }, signal()),
    ).rejects.toMatchObject({ reason: 'unreachable' });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(active.close).not.toHaveBeenCalled();
    expect(lease.getSnapshot().status).toBe('ready');
  });

  it('rejects a check closed by backgrounding before its final pairing read completes', async () => {
    const checked = session();
    const latest = deferred<DesktopConnectionRow>();
    store.getRow.mockResolvedValueOnce(row).mockImplementationOnce(() => latest.promise);
    connect.mockResolvedValueOnce(checked as never);
    const failed = expect(
      manager.testEndpoint(row.id, original.configuredEndpoints[0], signal()),
    ).rejects.toMatchObject({ reason: 'unreachable' });
    await jest.advanceTimersByTimeAsync(0);
    appState('background');
    latest.resolve(row);
    await failed;
    expect(checked.close).toHaveBeenCalled();
  });

  it('keeps channels and pairing checks through iOS inactive overlays', async () => {
    const channel = session();
    connect.mockResolvedValueOnce(channel as never);
    const agent = await manager.retain(row.id, 'agent', signal());
    await agent.ready(signal());

    const checked = session();
    const latest = deferred<DesktopConnectionRow>();
    store.getRow.mockResolvedValueOnce(row).mockImplementationOnce(() => latest.promise);
    connect.mockResolvedValueOnce(checked as never);
    const check = manager.testEndpoint(row.id, original.configuredEndpoints[0], signal());
    await jest.advanceTimersByTimeAsync(0);
    appState('inactive');
    latest.resolve(row);
    await expect(check).resolves.toBeUndefined();
    await jest.advanceTimersByTimeAsync(30_000);
    appState('active');

    expect(channel.close).not.toHaveBeenCalled();
    expect(agent.getSnapshot().status).toBe('ready');
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it.each(['inactive', 'background', 'unknown'] as const)(
    'connects after becoming active between construction in %s and initialization',
    async (initialState) => {
      await manager._doStop();
      await manager._doDestroy();
      AppState.currentState = initialState;
      manager = new DesktopConnectionManager();
      manager.configure(store);
      // Native AppState updates before the manager subscribes, without a later change event.
      AppState.currentState = 'active';
      await manager._doInit();

      const channel = session();
      connect.mockResolvedValueOnce(channel as never);
      const lease = await manager.retain(row.id, 'agent', signal());
      await expect(lease.ready(signal())).resolves.toBe(channel);
      expect(lease.getSnapshot().status).toBe('ready');
    },
  );

  it('waits for foreground when backgrounded between construction and initialization', async () => {
    await manager._doStop();
    await manager._doDestroy();
    manager = new DesktopConnectionManager();
    manager.configure(store);
    AppState.currentState = 'background';
    await manager._doInit();

    const channel = session();
    connect.mockResolvedValueOnce(channel as never);
    const lease = await manager.retain(row.id, 'agent', signal());
    expect(lease.getSnapshot().status).toBe('suspended');
    await jest.advanceTimersByTimeAsync(30_000);
    expect(connect).not.toHaveBeenCalled();
    appState('active');
    await expect(lease.ready(signal())).resolves.toBe(channel);
  });

  it('continues past a wrong Noise peer without changing grants or retiring the stable lease', async () => {
    row.configuredEndpoints.push({ host: '192.168.1.3', port: 24444, security: 'ws' });
    connect.mockRejectedValueOnce(
      Object.assign(new Error('Wrong desktop'), { name: 'UnexpectedPeerError' }),
    );
    const channel = session();
    connect.mockResolvedValueOnce(channel as never);
    const lease = await manager.retain(row.id, 'agent', signal());
    const scope = lease.scope;
    await expect(lease.ready(signal())).resolves.toBe(channel);
    expect(lease.scope).toBe(scope);
    expect(lease.signal.aborted).toBe(false);
    expect(row.status).toBe('paired');
    expect(row.grants).toEqual(grants);
    expect(jest.mocked(openWebSocketStream).mock.calls.map(([url]) => url)).toEqual([
      'ws://192.168.1.2:23333/v1/remote/connect',
      'ws://192.168.1.3:24444/v1/remote/connect',
    ]);
  });

  it('closes a late socket after the final lease is released without waiting for idle grace', async () => {
    const opening = deferred<Awaited<ReturnType<typeof openWebSocketStream>>>();
    jest.mocked(openWebSocketStream).mockReturnValueOnce(opening.promise);
    const lease = await manager.retain(row.id, 'agent', signal());
    await jest.advanceTimersByTimeAsync(0);
    const dialSignal = jest.mocked(openWebSocketStream).mock.calls[0][1];
    lease.release();
    expect(dialSignal.aborted).toBe(true);
    let aborted = false;
    opening.resolve({
      abort() {
        aborted = true;
      },
    } as never);
    await jest.advanceTimersByTimeAsync(0);
    expect(aborted).toBe(true);
    expect(connect).not.toHaveBeenCalled();
  });

  it('uses a fresh QR location for the existing binding without another pairing handshake', async () => {
    row.configuredEndpoints = [];
    const channel = session();
    connect.mockResolvedValueOnce(channel as never);
    const lease = await manager.retain(row.id, 'agent', signal());
    const scope = lease.scope;
    await jest.advanceTimersByTimeAsync(0);
    manager.seedLocation(row.id, row.desktopIdentity, [
      { host: '10.2.0.4', port: 24444, security: 'ws' },
    ]);
    await expect(lease.ready(signal())).resolves.toBe(channel);
    expect(lease.scope).toBe(scope);
    expect(row.deviceId).toBe('device-1');
    expect(row.grants).toEqual(grants);
  });

  it('keeps a healthy channel and business scope through network changes', async () => {
    const channel = session();
    connect.mockResolvedValue(channel as never);
    const lease = await manager.retain(row.id, 'agent', signal());
    await lease.ready(signal());
    const scope = lease.scope;
    mockDiscoveryReceive({ type: 'network' });
    await expect(lease.ready(signal())).resolves.toBe(channel);
    expect(channel.isOpen).toBe(true);
    expect(lease.scope).toBe(scope);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('cancels a dial from the old network and reconnects without retiring the lease', async () => {
    const channel = session();
    connect.mockImplementationOnce(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );
    connect.mockResolvedValueOnce(channel as never);
    const lease = await manager.retain(row.id, 'agent', signal());
    const scope = lease.scope;
    await jest.advanceTimersByTimeAsync(0);
    const firstSignal = connect.mock.calls[0][0].signal;
    mockDiscoveryReceive({ type: 'network' });
    await expect(lease.ready(signal())).resolves.toBe(channel);
    expect(firstSignal.aborted).toBe(true);
    expect(lease.scope).toBe(scope);
    expect(lease.signal.aborted).toBe(false);
  });

  it('publishes binding invalidation with no active lease and scopes authorization changes by domain', async () => {
    const invalidated = jest.fn();
    const unsubscribe = manager.subscribeInvalidation(invalidated);
    manager.invalidate(row.id, 'removed');
    expect(invalidated).toHaveBeenLastCalledWith({ connectionId: row.id });
    await manager.revoke(row.id, 'configuration', 'config-1');
    expect(invalidated).toHaveBeenLastCalledWith({
      connectionId: row.id,
      domain: 'configuration',
      grantId: 'config-1',
    });
    const channel = session();
    connect.mockResolvedValue(channel as never);
    const lease = await manager.retain(row.id, 'agent', signal());
    await lease.ready(signal());
    invalidated.mockClear();
    channel.refresh({ grants: [grants[0]] });
    await jest.advanceTimersByTimeAsync(0);
    expect(invalidated).toHaveBeenCalledWith({
      connectionId: row.id,
      domain: 'agent',
      grantId: 'agent-1',
    });
    expect(lease.getSnapshot().status).toBe('retired');
    unsubscribe();
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

  it('keeps active conversation demand connected in the background and suspends after it settles', async () => {
    const first = session();
    const next = session();
    connect.mockResolvedValueOnce(first as never).mockResolvedValueOnce(next as never);
    const agent = await manager.retain(row.id, 'agent', signal());
    await agent.ready(signal());
    agent.setBackgroundRequired?.(true);
    appState('background');
    expect(first.close).not.toHaveBeenCalled();
    expect(agent.getSnapshot().status).toBe('ready');
    await jest.advanceTimersByTimeAsync(30_000);
    expect(connect).toHaveBeenCalledTimes(1);
    agent.setBackgroundRequired?.(false);
    expect(first.close).toHaveBeenCalled();
    expect(agent.getSnapshot().status).toBe('suspended');
    appState('active');
    expect(await agent.ready(signal())).toBe(next);
  });

  it('ends background demand after the desktop stays unreachable for a minute', async () => {
    const first = session();
    const next = session();
    connect.mockResolvedValueOnce(first as never);
    const agent = await manager.retain(row.id, 'agent', signal());
    await agent.ready(signal());
    agent.setBackgroundRequired?.(true);
    appState('background');
    connect.mockRejectedValue(new Error('Desktop unreachable'));
    first.close();
    await jest.advanceTimersByTimeAsync(59_000);
    expect(agent.getSnapshot().status).not.toBe('suspended');
    await jest.advanceTimersByTimeAsync(1_000);
    expect(agent.getSnapshot().status).toBe('suspended');
    const attempts = connect.mock.calls.length;
    await jest.advanceTimersByTimeAsync(120_000);
    expect(connect).toHaveBeenCalledTimes(attempts);
    connect.mockReset();
    connect.mockResolvedValueOnce(next as never);
    appState('active');
    expect(await agent.ready(signal())).toBe(next);
  });

  it('does not carry hidden reconnect backoff into the first foreground retry', async () => {
    const first = session();
    const next = session();
    connect.mockResolvedValueOnce(first as never);
    const agent = await manager.retain(row.id, 'agent', signal());
    await agent.ready(signal());
    agent.setBackgroundRequired?.(true);
    appState('background');
    mockDiscoveryReceive({ type: 'unavailable' });
    connect.mockRejectedValue(new Error('Desktop unreachable'));
    first.close();
    await jest.advanceTimersByTimeAsync(45_000);
    const hiddenAttempts = connect.mock.calls.length;
    expect(hiddenAttempts).toBeGreaterThan(5);

    appState('active');
    await jest.advanceTimersByTimeAsync(0);
    expect(connect).toHaveBeenCalledTimes(hiddenAttempts + 1);
    connect.mockReset();
    connect.mockResolvedValueOnce(next as never);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(agent.getSnapshot().status).toBe('ready');
    expect(await agent.ready(signal())).toBe(next);
  });

  it('suspends all physical channels and reconnects retained consumers on foreground', async () => {
    const first = session();
    const next = session();
    connect.mockResolvedValueOnce(first as never).mockResolvedValueOnce(next as never);
    mockDiscoveryReceive({ type: 'unavailable' });
    const agent = await manager.retain(row.id, 'agent', signal());
    await agent.ready(signal());
    await jest.advanceTimersByTimeAsync(300_000);
    appState('background');
    expect(first.close).toHaveBeenCalled();
    expect(agent.getSnapshot().status).toBe('suspended');
    await jest.advanceTimersByTimeAsync(30_000);
    expect(connect).toHaveBeenCalledTimes(1);
    appState('active');
    expect(await agent.ready(signal())).toBe(next);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(openWebSocketStream).toHaveBeenLastCalledWith(
      directEndpointUrl(original.configuredEndpoints[0]),
      expect.any(AbortSignal),
    );
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
    const opening = manager.connectTemporary(
      { ...original, addresses: ['192.168.1.2'], port: 23333 },
      caller.signal,
    );
    const rejected = expect(opening).rejects.toMatchObject({ name: 'AbortError' });
    await jest.advanceTimersByTimeAsync(0);
    caller.abort();
    dial.resolve(channel as never);
    await rejected;
    expect(channel.close).toHaveBeenCalledTimes(1);
  });
});
