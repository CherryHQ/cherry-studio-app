import { RemoteAgentCommandJournal } from '@/backend/data/services/RemoteAgentCommandJournal';
import type { DesktopConnections, DesktopDomainLease } from '@/backend/services/desktopConnections';
import { RemoteAgentScope } from '@/backend/services/remoteAgent/RemoteAgentScope';
import { integrity } from '@/backend/services/remoteAgent/remoteContent';
import { RemoteSessionReadCache } from '@/backend/services/remoteAgent/RemoteSessionReadCache';
import { resolveMessageCitations } from '@/frontend/utils/messageCitations';

import { createRemoteConversationSource } from '../createRemoteConversationSource';

it('reads real source-url content refs through backend integrity verification with revision and scope isolation', async () => {
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
      new RemoteSessionReadCache(),
    );
    const frontend = createRemoteConversationSource('pc', backend);
    return {
      backend,
      frontend,
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
  const address = {
    source: { kind: 'desktop' as const, connectionId: 'pc' },
    sessionId: 'session',
  };
  const first = await a.frontend.openSession(address, signal);
  const selection = await first.history.prepareSelection!(['m'], signal);
  expect(selection.messages[0].citationSources).toEqual([
    { id: 's', title: 'S', url: 'https://first-1.example' },
  ]);
  const window = await first.history.openLatest(signal);
  for (let i = 0; i < 100; i++) await Promise.resolve();
  const row = first.history.projection!.resolve(window.initial.items[0]);
  expect(resolveMessageCitations(row.display.data.parts!).sourceNumberById.get('s')).toBe(1);
  expect(a.request.mock.calls.filter(([method]) => method === 'agent.content.read')).toHaveLength(
    1,
  );
  a.setRevision('2');
  const next = await first.history.prepareSelection!(['m'], signal);
  expect(next.messages[0].citationSources?.[0].url).toBe('https://first-2.example');
  const old = await a.backend.history('session', '2', undefined, signal);
  const handle = old.items[0].parts.find((part) => part.kind === 'data');
  if (handle?.kind !== 'data') throw new Error('Expected data resource');
  await expect(b.backend.readResource(handle.resource, signal)).rejects.toMatchObject({
    code: 'RESOURCE_UNAVAILABLE',
  });
  const second = await b.frontend.openSession(address, signal);
  expect(
    (await second.history.prepareSelection!(['m'], signal)).messages[0].citationSources?.[0].url,
  ).toBe('https://second-1.example');
  const invalid = await bad.frontend.openSession(address, signal);
  expect(
    (await invalid.history.prepareSelection!(['m'], signal)).messages[0].citationSources,
  ).toEqual([]);
  expect(bad.request.mock.calls.filter(([method]) => method === 'agent.content.read')).toHaveLength(
    1,
  );
  for (const test of [a, b, bad]) {
    test.frontend.dispose();
    test.backend.dispose();
    await test.backend.drain();
  }
});
