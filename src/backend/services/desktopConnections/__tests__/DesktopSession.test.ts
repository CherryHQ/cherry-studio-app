import type { SecureChannel } from '@cherrystudio/remote-transport';

import { DesktopSession, RemoteFailureError } from '../DesktopSession';

jest.mock('@cherrystudio/remote-transport', () => ({}));
jest.mock('../remoteSocket', () => ({
  ...jest.requireActual('../remoteSocket'),
  openWebSocketStream: jest.fn(),
}));

const NO_REPLY = Symbol('no reply');
type Handler = (params: unknown) => unknown;

/** In-memory desktop: scripted JSON-RPC replies plus a hook to push notifications. */
function fakeChannel(handlers: Record<string, Handler>) {
  const inbox: unknown[] = [];
  const waiters: ((value: unknown) => void)[] = [];
  const deliver = (value: unknown) => {
    const waiter = waiters.shift();
    if (waiter) waiter(value);
    else inbox.push(value);
  };
  const channel: SecureChannel & { deliver: (value: unknown) => void; closed: boolean } = {
    remoteIdentity: '12D3KooWDesktop',
    protocolVersion: 1,
    offeredVersions: [1],
    closed: false,
    deliver,
    async read() {
      if (inbox.length) return inbox.shift();
      return new Promise((resolve) => waiters.push(resolve));
    },
    async write(value: unknown) {
      const request = value as { id: unknown; method: string; params: unknown };
      const handler = handlers[request.method];
      queueMicrotask(() => {
        try {
          const result = handler ? handler(request.params) : undefined;
          if (result === NO_REPLY) return;
          deliver({ jsonrpc: '2.0', id: request.id, result });
        } catch (error) {
          deliver({
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: 1000,
              message: (error as Error).message,
              data: (error as { data?: unknown }).data,
            },
          });
        }
      });
    },
    async close() {
      channel.closed = true;
      deliver(undefined);
    },
    abort() {
      channel.closed = true;
    },
  };
  return channel;
}

const hello = {
  'connection.hello': () => ({
    protocolVersion: 1,
    limits: { recordBytes: 65_536 },
    heartbeatMs: 20_000,
  }),
};
const options = (channels: Record<string, ReturnType<typeof fakeChannel>>) => ({
  addresses: Object.keys(channels),
  port: 24444,
  desktopIdentity: '12D3KooWDesktop',
  identity: new Uint8Array(32),
  signal: new AbortController().signal,
  dial: async (url: string) => {
    const address = url.slice('ws://'.length, url.indexOf(':24444'));
    const channel = channels[address];
    if (!channel) throw new Error(`refused ${address}`);
    return channel;
  },
});

describe('DesktopSession', () => {
  it('blocks unsupported Agent contracts without disconnecting configuration access', async () => {
    const channel = fakeChannel({
      ...hello,
      'configuration.export.prepare': () => ({
        exportId: 'export',
        byteLength: '2',
        sha256: 'a'.repeat(64),
        expiresAt: '2026-09-23T00:00:00Z',
      }),
      'connection.ping': ({ nonce }: any) => ({ nonce, serverTime: '2026-09-23T00:00:00Z' }),
    });
    const session = await DesktopSession.connect(options({ '10.0.0.1': channel }));
    await expect(session.request('agent.agents.list', {})).rejects.toMatchObject({
      reason: 'UPGRADE_REQUIRED',
    });
    expect(session.isOpen).toBe(true);
    await expect(session.request('configuration.export.prepare', {})).resolves.toMatchObject({
      exportId: 'export',
    });
    await expect(session.request('connection.ping', { nonce: 'ok' })).resolves.toMatchObject({
      nonce: 'ok',
    });
    session.close();
  });

  it('accepts Agent methods only when the desktop advertises the failure contract', async () => {
    const channel = fakeChannel({
      'connection.hello': () => ({ ...hello['connection.hello'](), agentFailureVersion: 1 }),
      'agent.agents.list': () => ({ items: [], nextCursor: null }),
    });
    const session = await DesktopSession.connect(options({ '10.0.0.1': channel }));
    await expect(session.request('agent.agents.list', {})).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    session.close();
  });
  it('falls through unreachable addresses and completes hello on the first that answers', async () => {
    const good = fakeChannel(hello);
    const session = await DesktopSession.connect(
      options({ '10.0.0.9': undefined as never, '192.168.1.2': good }),
    );
    expect(session.address).toBe('192.168.1.2');
    session.close();
    expect(good.closed).toBe(true);
  });

  it('turns desktop failures into typed errors and validates results against the protocol schema', async () => {
    const channel = fakeChannel({
      ...hello,
      'connection.ping': () => {
        throw Object.assign(new Error('Hello is required'), {
          data: { reason: 'INVALID_CONNECTION_STATE', message: 'Hello is required' },
        });
      },
      'pairing.get': () => ({ status: 'nonsense' }),
    });
    const session = await DesktopSession.connect(options({ '192.168.1.2': channel }));
    await expect(session.request('connection.ping', { nonce: 'n' })).rejects.toBeInstanceOf(
      RemoteFailureError,
    );
    await expect(session.request('connection.ping', { nonce: 'n' })).rejects.toMatchObject({
      reason: 'INVALID_CONNECTION_STATE',
    });
    await expect(session.request('pairing.get', { claimId: 'c' })).rejects.toThrow();
    session.close();
  });

  it('dispatches notifications and rejects in-flight requests when the channel drops', async () => {
    const channel = fakeChannel({ ...hello, 'connection.ping': () => NO_REPLY });
    const session = await DesktopSession.connect(options({ '192.168.1.2': channel }));
    const received: unknown[] = [];
    session.onNotification((notification) => received.push(notification));
    channel.deliver({ jsonrpc: '2.0', method: 'agent.events', params: { seq: '1' } });
    const pending = session.request('connection.ping', { nonce: 'n' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(received).toEqual([{ jsonrpc: '2.0', method: 'agent.events', params: { seq: '1' } }]);

    await channel.close();
    await expect(pending).rejects.toThrow('Connection closed');
    expect(session.isOpen).toBe(false);
    await expect(session.request('connection.ping', { nonce: 'n' })).rejects.toThrow();
  });

  it('authenticates with the device id only and remembers the desktop grants', async () => {
    const grants = [{ domain: 'agent', grantId: 'g1' }];
    const channel = fakeChannel({
      ...hello,
      'connection.authenticate': (params) => ({
        ...(params as object),
        authorization: { grants },
        accessToken: 'token',
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      }),
    });
    const session = await DesktopSession.connect(options({ '192.168.1.2': channel }));
    await expect(session.authenticate('device-1')).resolves.toEqual({ grants });
    expect(session.currentAuthorization).toEqual({ grants });
    session.close();
  });
});
