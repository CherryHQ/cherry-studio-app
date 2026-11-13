import { RemoteAgentCommandJournal } from '@/backend/data/services/RemoteAgentCommandJournal';
import type { DesktopConnections, DesktopDomainLease } from '@/backend/services/desktopConnections';
import type { RemoteMessageView } from '@/shared/contracts/remoteAgent';

import { RemoteAgentScope } from '../RemoteAgentScope';
import { integrity } from '../remoteContent';
import { RemoteSessionReadCache } from '../RemoteSessionReadCache';

it('reads real source-url content refs through backend integrity verification with revision and scope isolation', async () => {
  const cache = new RemoteSessionReadCache();
  function fixture(scope: string, corrupt = false) {
    let revision = '1';
    const bytes = () =>
      Buffer.from(
        JSON.stringify({ sourceId: 's', title: 'S', url: `https://${scope}-${revision}.example` }),
      );
    const ref = () => ({
      contentId: 'source',
      revision,
      mediaType: 'application/json',
      byteLength: String(bytes().length),
      sha256: integrity.sha256(bytes()),
    });
    const request = jest.fn(async (method: string) => {
      if (method === 'agent.sessions.get')
        return {
          session: {
            sessionId: 'session',
            agentId: 'a',
            workspaceId: 'w',
            title: 'Session',
            updatedAt: '2026-09-22T00:00:00.000Z',
            historyRevision: revision,
          },
        };
      if (method === 'agent.messages.list')
        return {
          items: [
            {
              messageId: 'm',
              revision,
              role: 'assistant',
              status: 'success',
              partIds: ['text', 'source'],
            },
          ],
        };
      if (method === 'agent.parts.list')
        return {
          items: [
            {
              partId: 'text',
              revision,
              kind: 'text',
              state: 'completed',
              content: { text: 'Answer [cite:s]' },
            },
            {
              partId: 'source',
              revision,
              kind: 'data',
              name: 'source-url',
              state: 'completed',
              content: { ref: ref() },
            },
          ],
        };
      if (method === 'agent.content.read')
        return {
          ...ref(),
          offset: '0',
          nextOffset: String(bytes().length),
          eof: true,
          dataBase64: (corrupt ? Buffer.alloc(bytes().length) : bytes()).toString('base64'),
        };
      throw new Error(method);
    });
    const lease: DesktopDomainLease = {
      scope,
      connectionId: 'pc',
      grantId: 'grant',
      signal: new AbortController().signal,
      getSnapshot: () => ({ status: 'ready' }),
      subscribe: () => () => {},
      ready: async () => ({ request }) as never,
      setBackgroundRequired: () => {},
      release: () => {},
    };
    const journal = new RemoteAgentCommandJournal({
      getString: () => undefined,
      set: () => {},
      getAllKeys: () => [],
      remove: () => false,
    });
    const backend = new RemoteAgentScope(
      lease,
      {
        retain: () => {},
        revoke: () => {},
        subscribeInvalidation: () => () => {},
      } as unknown as DesktopConnections,
      journal,
      cache,
    );
    return {
      backend,
      request,
      setRevision: (value: string) => {
        revision = value;
      },
    };
  }
  const a = fixture('first');
  const b = fixture('second');
  const bad = fixture('corrupt', true);
  const signal = new AbortController().signal;
  const resource = async (backend: RemoteAgentScope, revision: string) => {
    const history = await backend.history('session', revision, undefined, signal);
    const part = history.items[0].parts.find(
      (part): part is Extract<RemoteMessageView['parts'][number], { kind: 'data' }> =>
        part.kind === 'data' && part.name === 'source-url',
    );
    if (!part) throw new Error('Expected source-url resource');
    return part.resource;
  };
  const expected = (scope: string, revision: string) => ({
    kind: 'text',
    text: JSON.stringify({
      sourceId: 's',
      title: 'S',
      url: `https://${scope}-${revision}.example`,
    }),
  });
  try {
    const first = await resource(a.backend, '1');
    await expect(a.backend.readResource(first, signal)).resolves.toEqual(expected('first', '1'));
    await expect(a.backend.readResource(first, signal)).resolves.toEqual(expected('first', '1'));
    expect(a.request.mock.calls.filter(([method]) => method === 'agent.content.read')).toHaveLength(
      1,
    );

    a.setRevision('2');
    const next = await resource(a.backend, '2');
    expect(next).not.toBe(first);
    await expect(a.backend.readResource(next, signal)).resolves.toEqual(expected('first', '2'));
    expect(a.request.mock.calls.filter(([method]) => method === 'agent.content.read')).toHaveLength(
      2,
    );
    await expect(a.backend.history('session', '1', undefined, signal)).rejects.toMatchObject({
      code: 'REVISION_EXPIRED',
    });

    const second = await resource(b.backend, '1');
    await expect(b.backend.readResource(next, signal)).rejects.toMatchObject({
      code: 'RESOURCE_UNAVAILABLE',
    });
    await expect(b.backend.readResource(second, signal)).resolves.toEqual(expected('second', '1'));
    expect(b.request.mock.calls.filter(([method]) => method === 'agent.content.read')).toHaveLength(
      1,
    );

    const invalid = await resource(bad.backend, '1');
    await expect(bad.backend.readResource(invalid, signal)).rejects.toMatchObject({
      code: 'PROTOCOL_ERROR',
    });
    expect(
      bad.request.mock.calls.filter(([method]) => method === 'agent.content.read'),
    ).toHaveLength(1);
  } finally {
    for (const test of [a, b, bad]) test.backend.dispose();
    await Promise.all([a, b, bad].map((test) => test.backend.drain()));
  }
});
