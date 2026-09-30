import type { RemoteAuthorization } from '@cherrystudio/remote-protocol';
import { AppState } from 'react-native';

import type { DesktopConnectionService } from '@/backend/data/services/DesktopConnectionService';

import { DesktopConnectionManager } from '../DesktopConnectionManager';
import { DesktopConnectionRuntime } from '../DesktopConnectionRuntime';
import {
  DesktopSession,
  DesktopUnreachableError,
  RemoteFailureError,
  RemoteTransportError,
} from '../DesktopSession';
import { openWebSocketStream } from '../remoteSocket';

jest.mock('@cherrystudio/remote-transport', () => ({}));
jest.mock('../remoteSocket', () => ({ openWebSocketStream: jest.fn() }));
jest.mock('../desktopDiscovery', () => ({
  DesktopDiscovery: class {
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

const id = 'f676e1d5-24c6-4150-a3fa-0f4427964465';
const grants: RemoteAuthorization['grants'] = [{ domain: 'configuration', grantId: 'grant-1' }];
const row = {
  id,
  name: 'Desktop',
  deviceId: 'device-1',
  desktopIdentity: '12D3KooWDesktop',
  learnedEndpoints: [] as { host: string; port: number; security: 'ws' | 'wss' }[],
  configuredEndpoints: [{ host: '192.168.1.2', port: 23333, security: 'ws' as const }],
  addresses: ['192.168.1.2'],
  port: 23333,
  grants,
  status: 'paired' as const,
  lastFetchedAt: null,
  createdAt: 1,
  updatedAt: 1,
};
const connection = {
  configuredEndpoints: [],
  id,
  name: 'Desktop',
  status: 'paired' as const,
  lastFetchedAt: null,
  capabilities: ['configuration' as const],
};
const pairing = {
  connectionId: id,
  t: 'cherry-studio-pair' as const,
  v: 2 as const,
  ips: ['192.168.1.2'],
  port: 23333,
  name: 'Desktop',
  invitationId: 'invitation',
  invitationSecret: 'secret',
  desktopIdentity: '12D3KooWDesktop',
  protocolVersions: [1],
  capabilities: ['configuration' as const, 'agent' as const],
};
const signal = () => new AbortController().signal;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createStore() {
  let currentRow: Awaited<ReturnType<DesktopConnectionService['getRow']>> = { ...row };
  return {
    getRow: jest.fn(async () => currentRow),
    getById: jest.fn(async () => ({
      ...connection,
      status: currentRow.status,
      capabilities: currentRow.grants.map((grant) => grant.domain),
    })),
    savePair: jest.fn(async () => connection),
    remove: jest.fn(async () => undefined),
    updateStatus: jest.fn(
      async (_id: string, values: Parameters<DesktopConnectionService['updateStatus']>[1]) => {
        currentRow = { ...currentRow, ...values };
      },
    ),
    addEndpoint: jest.fn(async () => undefined),
    updateLearnedEndpoints: jest.fn(async (_id, endpoints) => {
      currentRow = { ...currentRow, learnedEndpoints: endpoints };
      return endpoints;
    }),
    preview: jest.fn(async () => ({ providers: [] })),
    import: jest.fn(async () => ({
      providersAdded: 0,
      providersUpdated: 0,
      modelsAdded: 0,
      modelsSkipped: 0,
    })),
  } satisfies Pick<
    DesktopConnectionService,
    | 'getRow'
    | 'getById'
    | 'savePair'
    | 'remove'
    | 'updateStatus'
    | 'preview'
    | 'import'
    | 'addEndpoint'
    | 'updateLearnedEndpoints'
  >;
}

/** Scripted desktop: answers each method from a table, exposes the request log. */
function createSession(handlers: Record<string, (params: any) => unknown>) {
  const closed = deferred<void>();
  const session = {
    isOpen: true,
    done: closed.promise,
    currentAuthorization: { grants } as RemoteAuthorization | undefined,
    address: '192.168.1.2',
    onAuthorization: jest.fn(() => () => undefined),
    calls: [] as { method: string; params: unknown }[],
    request: jest.fn(async (method: string, params: unknown) => {
      session.calls.push({ method, params });
      const handler = handlers[method];
      if (!handler) throw new Error(`Unexpected ${method}`);
      const result = await handler(params);
      if (method === 'pairing.get') {
        const decision = result as { status: string; authorization?: RemoteAuthorization };
        if (decision.status === 'approved') session.currentAuthorization = decision.authorization;
      }
      return result;
    }),
    authenticate: jest.fn(async () => {
      if (!handlers['connection.authenticate'])
        throw new RemoteFailureError({ reason: 'UNAUTHENTICATED', message: 'Pairing required' });
      const result = (await handlers['connection.authenticate']({})) as {
        authorization: { grants: typeof grants };
      };
      session.currentAuthorization = result.authorization;
      return result.authorization;
    }),
    close: jest.fn(() => {
      session.isOpen = false;
      closed.resolve();
    }),
  };
  return session;
}

function exportHandlers(payload: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const { sha256 } = jest.requireActual(
    '@noble/hashes/sha2.js',
  ) as typeof import('@noble/hashes/sha2.js');
  const digest = Array.from(sha256(bytes), (byte: number) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return {
    'connection.authenticate': () => ({
      deviceId: 'device-1',
      authorization: { grants },
      accessToken: 't',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    }),
    'configuration.export.prepare': () => ({
      exportId: 'export',
      byteLength: String(bytes.length),
      sha256: digest,
    }),
    'configuration.export.read': ({ offset, maxBytes }: { offset: string; maxBytes: number }) => {
      const start = Number(offset);
      const slice = bytes.subarray(start, start + maxBytes);
      return {
        exportId: 'export',
        offset,
        nextOffset: String(start + slice.length),
        dataBase64: Buffer.from(slice).toString('base64'),
        eof: start + slice.length === bytes.length,
      };
    },
  };
}

describe('DesktopConnectionRuntime', () => {
  let runtime: DesktopConnectionRuntime;
  let manager: DesktopConnectionManager;
  let store: ReturnType<typeof createStore>;
  let ensureModelRegistryReady: jest.Mock<Promise<void>, []>;
  const connect = jest.mocked(DesktopSession.connect);

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.mocked(openWebSocketStream).mockImplementation(async () => ({ abort() {} }) as never);
    AppState.currentState = 'active';
    jest.mocked(AppState.addEventListener).mockReturnValue({ remove: jest.fn() });
    store = createStore();
    runtime = new DesktopConnectionRuntime();
    ensureModelRegistryReady = jest.fn(async () => undefined);
    manager = new DesktopConnectionManager();
    manager.configure(store);
    await manager._doInit();
    runtime.configure(store, ensureModelRegistryReady, manager);
    await runtime._doInit();
  });

  afterEach(async () => {
    await runtime._doStop();
    await runtime._doDestroy();
    await manager._doStop();
    await manager._doDestroy();
  });

  it('saves authenticated desktop addresses before initial pairing completes', async () => {
    const vpn = { host: '100.64.0.2', port: 23333, security: 'ws' };
    const session = Object.assign(
      createSession({
        'pairing.claim': () => ({
          claimId: 'claim',
          verificationCode: '123456',
          expiresAt: '2026-09-30T00:02:00Z',
        }),
        'pairing.get': () => ({
          status: 'approved',
          deviceId: row.deviceId,
          authorization: { grants },
        }),
        'connection.authenticate': () => ({ authorization: { grants } }),
        'connection.endpoints': () => ({ desktopIdentity: row.desktopIdentity, endpoints: [vpn] }),
      }),
      { connectionEndpointsVersion: 1, currentAuthorization: undefined },
    );
    connect.mockResolvedValueOnce(session as never);
    await expect(runtime.pair({ ...pairing, connectionId: undefined }, signal())).resolves.toEqual(
      connection,
    );
    expect((await store.getRow()).learnedEndpoints).toEqual([vpn]);
    expect(session.calls.map((call) => call.method)).toEqual([
      'pairing.claim',
      'pairing.get',
      'connection.endpoints',
    ]);
    expect(session.isOpen).toBe(false);
  });

  it('completes pairing even when automatic address sync is unavailable', async () => {
    const session = Object.assign(
      createSession({
        'pairing.claim': () => ({
          claimId: 'claim',
          verificationCode: '123456',
          expiresAt: '2026-09-30T00:02:00Z',
        }),
        'pairing.get': () => ({
          status: 'approved',
          deviceId: row.deviceId,
          authorization: { grants },
        }),
        'connection.endpoints': () => {
          throw new Error('Address query failed');
        },
      }),
      { connectionEndpointsVersion: 1 },
    );
    connect.mockResolvedValueOnce(session as never);
    await expect(runtime.pair({ ...pairing, connectionId: undefined }, signal())).resolves.toEqual(
      connection,
    );
    expect((await store.getRow()).learnedEndpoints).toEqual([]);
    expect(session.isOpen).toBe(false);
  });

  it('verifies exactly the selected address before saving, without exporting provider credentials', async () => {
    const endpoint = { host: '100.64.0.2', port: 24444, security: 'ws' as const };
    const session = createSession({
      'connection.authenticate': () => ({ authorization: { grants } }),
      'connection.endpoints': () => ({
        desktopIdentity: row.desktopIdentity,
        endpoints: [endpoint],
      }),
    });
    connect.mockResolvedValueOnce(session as never);
    await expect(runtime.saveEndpoint(id, endpoint, signal())).resolves.toMatchObject({
      endpoint,
      verifiedAt: expect.any(Number),
    });
    expect(jest.mocked(openWebSocketStream).mock.calls.map(([url]) => url)).toEqual([
      'ws://100.64.0.2:24444/v1/remote/connect',
    ]);
    expect(session.calls).toEqual([
      { method: 'connection.endpoints', params: { domain: 'configuration' } },
    ]);
    expect(store.addEndpoint).toHaveBeenCalledWith(id, endpoint, row, expect.any(AbortSignal));
    expect(session.isOpen).toBe(false);
  });

  it('does not fall back to a LAN address or save when the selected address fails', async () => {
    jest.mocked(openWebSocketStream).mockRejectedValueOnce(new Error('unreachable'));
    await expect(
      runtime.saveEndpoint(id, { host: '100.64.0.2', port: 24444, security: 'ws' }, signal()),
    ).rejects.toMatchObject({ details: { reason: 'unreachable' } });
    expect(jest.mocked(openWebSocketStream).mock.calls.map(([url]) => url)).toEqual([
      'ws://100.64.0.2:24444/v1/remote/connect',
    ]);
    expect(store.addEndpoint).not.toHaveBeenCalled();
    expect(store.updateStatus).not.toHaveBeenCalled();
  });

  it('keeps suggestions ephemeral until the user requests saving', async () => {
    const endpoints = [{ host: '100.64.0.2', port: 23333, security: 'ws' }];
    connect.mockResolvedValueOnce(
      createSession({
        'connection.authenticate': () => ({ authorization: { grants } }),
        'connection.endpoints': () => ({ desktopIdentity: row.desktopIdentity, endpoints }),
      }) as never,
    );
    await expect(runtime.getEndpoints(id, signal())).resolves.toEqual(endpoints);
    expect(store.addEndpoint).not.toHaveBeenCalled();
  });

  it('does not save a verification result that arrives after cancellation', async () => {
    const requested = deferred<void>();
    const reply = deferred<unknown>();
    const session = createSession({
      'connection.authenticate': () => ({ authorization: { grants } }),
      'connection.endpoints': () => {
        requested.resolve();
        return reply.promise;
      },
    });
    connect.mockResolvedValueOnce(session as never);
    const controller = new AbortController();
    const pending = runtime.saveEndpoint(
      id,
      { host: '100.64.0.2', port: 23333, security: 'ws' },
      controller.signal,
    );
    await requested.promise;
    controller.abort();
    reply.resolve({ desktopIdentity: row.desktopIdentity, endpoints: [] });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(store.addEndpoint).not.toHaveBeenCalled();
    expect(session.isOpen).toBe(false);
  });

  it('does not save or invalidate the pairing when an older desktop cannot verify addresses', async () => {
    connect.mockResolvedValueOnce(
      createSession({
        'connection.authenticate': () => ({ authorization: { grants } }),
        'connection.endpoints': () => {
          throw new RemoteFailureError({ reason: 'UPGRADE_REQUIRED', message: 'Older desktop' });
        },
      }) as never,
    );
    await expect(
      runtime.saveEndpoint(id, { host: '100.64.0.2', port: 23333, security: 'ws' }, signal()),
    ).rejects.toMatchObject({ details: { reason: 'unsupported-version' } });
    expect(store.addEndpoint).not.toHaveBeenCalled();
    expect(store.updateStatus).not.toHaveBeenCalled();
  });

  it('retires connection consumers only after removal succeeds', async () => {
    const invalidate = jest.spyOn(manager, 'invalidate');
    store.remove.mockRejectedValueOnce(new Error('database busy'));
    await expect(runtime.remove(id, signal())).rejects.toThrow('database busy');
    expect(invalidate).not.toHaveBeenCalled();
    await runtime.remove(id, signal());
    expect(invalidate).toHaveBeenCalledWith(id, 'removed');
  });

  it('reports connection progress before the desktop responds and never advances ahead of approval', async () => {
    const transport = deferred<ReturnType<typeof createSession>>();
    const approval = deferred<unknown>();
    const saving = deferred<typeof connection>();
    const waiting = deferred<void>();
    const saveStarted = deferred<void>();
    const connecting = deferred<void>();
    const events: string[] = [];
    const session = createSession({
      'pairing.claim': () => ({ claimId: 'claim', verificationCode: '123456', expiresAt: 'later' }),
      'pairing.get': () => approval.promise,
    });
    connect.mockImplementationOnce(() => transport.promise as never);
    store.savePair.mockImplementationOnce(() => saving.promise);
    const result = runtime.pair(pairing, signal(), (event) => {
      events.push(event.stage);
      if (event.stage === 'connecting') connecting.resolve();
      if (event.stage === 'waiting') waiting.resolve();
      if (event.stage === 'saving') saveStarted.resolve();
    });
    await connecting.promise;
    expect(events).toEqual(['connecting']);
    transport.resolve(session);
    await waiting.promise;
    expect(events).toEqual(['connecting', 'requesting', 'waiting']);
    expect(store.savePair).not.toHaveBeenCalled();
    approval.resolve({ status: 'approved', deviceId: row.deviceId, authorization: { grants } });
    await saveStarted.promise;
    expect(events.at(-1)).toBe('saving');
    expect(events).not.toContain('syncing');
    saving.resolve(connection);
    await expect(result).resolves.toEqual(connection);
    expect(events.at(-1)).toBe('syncing');
  });

  it('requests approval after revoked authorization, then stores the newly approved pairing', async () => {
    let polls = 0;
    const session = createSession({
      'connection.authenticate': () => {
        throw new RemoteFailureError({ reason: 'UNAUTHENTICATED', message: 'Device revoked' });
      },
      'pairing.claim': () => ({
        claimId: 'claim',
        verificationCode: '123456',
        expiresAt: '2026-09-22T00:02:00.000Z',
      }),
      'pairing.get': () =>
        ++polls < 2
          ? { status: 'pending' }
          : {
              status: 'approved',
              deviceId: 'device-1',
              authorization: { grants },
              accessToken: 't',
              expiresAt: '2026-09-22T00:12:00.000Z',
            },
    });
    connect.mockResolvedValue(session as never);
    const onProgress = jest.fn();
    const invalidate = jest.spyOn(manager, 'invalidate');

    await expect(runtime.pair(pairing, signal(), onProgress)).resolves.toEqual(connection);

    expect(invalidate).toHaveBeenCalledWith(id);
    expect(onProgress.mock.calls.map(([event]) => event)).toEqual([
      { stage: 'connecting' },
      { stage: 'requesting' },
      {
        stage: 'waiting',
        claim: { verificationCode: '123456', expiresAt: '2026-09-22T00:02:00.000Z' },
      },
      { stage: 'saving' },
      { stage: 'syncing' },
    ]);
    expect(session.calls[0]).toMatchObject({
      method: 'pairing.claim',
      params: { invitationId: 'invitation', capabilities: ['configuration', 'agent'] },
    });
    expect(store.savePair).toHaveBeenCalledWith(
      {
        id,
        name: 'Desktop',
        deviceId: 'device-1',
        desktopIdentity: '12D3KooWDesktop',
        grants,
      },
      true,
      expect.any(AbortSignal),
    );
    expect(session.close).toHaveBeenCalled();
  });

  it.each([
    ['rejected', 'pairing-rejected'],
    ['expired', 'pairing-expired'],
  ])('surfaces a %s claim as %s without saving anything', async (status, reason) => {
    const session = createSession({
      'pairing.claim': () => ({
        claimId: 'claim',
        verificationCode: '123456',
        expiresAt: '2026-09-22T00:02:00.000Z',
      }),
      'pairing.get': () => ({ status }),
    });
    connect.mockResolvedValue(session as never);

    const events: string[] = [];
    await expect(
      runtime.pair(pairing, signal(), (event) => events.push(event.stage)),
    ).rejects.toMatchObject({ details: { reason } });
    expect(events).toEqual(['connecting', 'requesting', 'waiting']);
    expect(store.savePair).not.toHaveBeenCalled();
    expect(session.close).toHaveBeenCalled();
  });

  it('maps an invalid invitation and an unreachable desktop to the settings error reasons', async () => {
    const session = createSession({
      'pairing.claim': () => {
        throw new RemoteFailureError({
          reason: 'FORBIDDEN',
          message: 'Invitation is invalid or expired',
        });
      },
    });
    connect.mockResolvedValueOnce(session as never);
    await expect(runtime.pair(pairing, signal())).rejects.toMatchObject({
      details: { reason: 'pairing-rejected' },
    });

    connect.mockRejectedValueOnce(new DesktopUnreachableError(['192.168.1.2: refused']));
    await expect(runtime.pair(pairing, signal())).rejects.toMatchObject({
      details: { reason: 'unreachable' },
    });
  });

  it('streams the export in pages, verifies its digest, and refreshes the stored grants', async () => {
    const session = createSession(
      exportHandlers({
        version: 1,
        providers: [
          { id: 'openai', name: 'OpenAI', models: [] },
          { id: 'local-embedding', name: 'Local', models: [] },
        ],
      }),
    );
    connect.mockResolvedValue(session as never);

    await runtime.preview(id, signal());

    expect(session.authenticate).toHaveBeenCalledWith('device-1', expect.any(AbortSignal));
    expect(store.updateStatus).toHaveBeenNthCalledWith(
      1,
      id,
      { grants, status: 'paired' },
      expect.any(AbortSignal),
      row,
    );
    expect(store.preview).toHaveBeenCalledWith({
      version: 1,
      providers: [{ apiKeys: [], id: 'openai', name: 'OpenAI', models: [] }],
    });
    expect(store.updateStatus).toHaveBeenLastCalledWith(
      id,
      { lastFetchedAt: expect.any(Number) },
      expect.any(AbortSignal),
      row,
    );
    expect(session.close).not.toHaveBeenCalled();
  });

  it('rejects an export whose bytes do not match the announced digest', async () => {
    const handlers = exportHandlers({ version: 1, providers: [] });
    handlers['configuration.export.prepare'] = () => ({
      exportId: 'export',
      byteLength: '30',
      sha256: 'f'.repeat(64),
    });
    connect.mockResolvedValue(createSession(handlers) as never);

    await expect(runtime.preview(id, signal())).rejects.toMatchObject({
      details: { reason: 'invalid-snapshot' },
    });
    expect(store.preview).not.toHaveBeenCalled();
  });

  it('refuses configuration sync when the desktop did not grant it', async () => {
    store.getRow.mockResolvedValueOnce({ ...row, grants: [{ domain: 'agent', grantId: 'g' }] });
    await expect(runtime.preview(id, signal())).rejects.toMatchObject({
      details: { reason: 'configuration-not-granted' },
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it('reconnects an authorized device and learns addresses without requesting approval', async () => {
    const endpoints = [{ host: '100.64.0.2', port: 23333, security: 'ws' }];
    const session = Object.assign(
      createSession({
        'connection.authenticate': () => ({ authorization: { grants } }),
        'connection.endpoints': () => ({ desktopIdentity: row.desktopIdentity, endpoints }),
      }),
      { connectionEndpointsVersion: 1 },
    );
    connect.mockResolvedValueOnce(session as never);
    const events: string[] = [];
    await expect(
      runtime.pair(pairing, signal(), (event) => events.push(event.stage)),
    ).resolves.toEqual(connection);
    expect(events).toEqual(['connecting', 'saving', 'syncing']);
    expect(session.calls.map((call) => call.method)).toEqual(['connection.endpoints']);
    expect((await store.getRow()).learnedEndpoints).toEqual(endpoints);
    expect((await store.getRow()).deviceId).toBe(row.deviceId);
    expect(store.savePair).not.toHaveBeenCalled();
    expect(session.isOpen).toBe(false);
  });

  it.each([
    new RemoteTransportError('timeout', 'Timed out'),
    new RemoteFailureError({ reason: 'INTERNAL', message: 'Desktop failed' }),
  ])(
    'preserves the binding without requesting approval when authentication has no verdict: %s',
    async (error) => {
      const session = createSession({
        'connection.authenticate': () => {
          throw error;
        },
      });
      connect.mockResolvedValueOnce(session as never);
      await expect(runtime.pair(pairing, signal())).rejects.toBeDefined();
      expect(session.calls).toEqual([]);
      expect(await store.getRow()).toEqual(row);
      expect(store.updateStatus).not.toHaveBeenCalled();
      expect(store.savePair).not.toHaveBeenCalled();
      expect(session.isOpen).toBe(false);
    },
  );

  it('does not save authorization received after the reconnect was cancelled', async () => {
    const started = deferred<void>();
    const reply = deferred<{ authorization: RemoteAuthorization }>();
    const session = createSession({
      'connection.authenticate': () => {
        started.resolve();
        return reply.promise;
      },
    });
    connect.mockResolvedValueOnce(session as never);
    const controller = new AbortController();
    const pending = runtime.pair(pairing, controller.signal);
    await started.promise;
    controller.abort();
    reply.resolve({ authorization: { grants } });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(store.updateStatus).not.toHaveBeenCalled();
    expect(store.savePair).not.toHaveBeenCalled();
    expect(session.calls).toEqual([]);
    expect(session.isOpen).toBe(false);
  });

  it('rejects a different desktop before connecting or overwriting the existing pairing', async () => {
    await expect(
      runtime.pair({ ...pairing, desktopIdentity: 'anotherPeer' }, signal()),
    ).rejects.toMatchObject({ details: { reason: 'identity-mismatch' } });
    expect(connect).not.toHaveBeenCalled();
    expect(await store.getRow()).toEqual(row);
    expect(store.savePair).not.toHaveBeenCalled();
  });

  it('marks a revoked device for repair before returning the authorization failure', async () => {
    const session = createSession({});
    session.authenticate.mockRejectedValueOnce(
      new RemoteFailureError({
        reason: 'UNAUTHENTICATED',
        message: 'Device authorization changed',
      }),
    );
    connect.mockResolvedValue(session as never);

    await expect(runtime.preview(id, signal())).rejects.toMatchObject({
      details: { reason: 'auth-revoked' },
    });
    expect(store.updateStatus).toHaveBeenCalledWith(
      id,
      { status: 'needs-repair' },
      expect.any(AbortSignal),
      row,
    );
    expect(session.close).toHaveBeenCalled();
    expect(store.preview).not.toHaveBeenCalled();
  });

  it('waits for the shared registry download before importing and allows a failed download to retry', async () => {
    connect.mockImplementation(
      async () => createSession(exportHandlers({ version: 1, providers: [] })) as never,
    );
    const input = { selections: [{ mode: 'provider-models' as const, providerId: 'openai' }] };
    ensureModelRegistryReady.mockRejectedValueOnce(new Error('registry unavailable'));
    await expect(runtime.import(id, input, signal())).rejects.toThrow('registry unavailable');
    expect(store.import).not.toHaveBeenCalled();

    const entered = deferred<void>();
    const ready = deferred<void>();
    ensureModelRegistryReady.mockImplementationOnce(async () => {
      entered.resolve();
      await ready.promise;
    });
    const request = runtime.import(id, input, signal());
    await entered.promise;
    expect(store.import).not.toHaveBeenCalled();
    ready.resolve();
    await request;
    expect(store.import).toHaveBeenCalledTimes(1);
  });

  it('imports provider configuration without requiring the model catalog', async () => {
    connect.mockResolvedValue(
      createSession(exportHandlers({ version: 1, providers: [] })) as never,
    );
    await runtime.import(
      id,
      { selections: [{ mode: 'provider', providerId: 'openai' }] },
      signal(),
    );
    expect(ensureModelRegistryReady).not.toHaveBeenCalled();
    expect(store.import).toHaveBeenCalledTimes(1);
  });

  it('allows removal to be retried after the database delete fails', async () => {
    store.remove.mockRejectedValueOnce(new Error('database busy'));
    await expect(runtime.remove(id, signal())).rejects.toThrow('database busy');
    await expect(runtime.remove(id, signal())).resolves.toBeUndefined();
    expect(store.remove).toHaveBeenCalledTimes(2);
  });

  it('aborts active requests and rejects queued work when its host stops', async () => {
    const entered = deferred<void>();
    connect.mockImplementationOnce(async ({ signal }) => {
      entered.resolve();
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });
    const preview = runtime.preview(id, signal());
    const previewAssertion = expect(preview).rejects.toMatchObject({ name: 'AbortError' });
    await entered.promise;
    const removal = runtime.remove(id, signal());
    const removalAssertion = expect(removal).rejects.toMatchObject({ name: 'AbortError' });
    await runtime._doStop();
    await Promise.all([previewAssertion, removalAssertion]);
    expect(store.remove).not.toHaveBeenCalled();
    expect(store.updateStatus).not.toHaveBeenCalled();
    await expect(runtime.preview(id, signal())).rejects.toMatchObject({ name: 'AbortError' });
  });
});
