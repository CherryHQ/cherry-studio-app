import type { AgentProtocol } from '@/shared/contracts/agent';
import type { RemoteAgentModule, RemoteAgentSource } from '@/shared/contracts/remoteAgent';
import type { ApiClient } from '@/shared/data/api/types';

import { createConversationSources } from '../createConversationSources';

test('Assistant addresses acquire only their independent domain owner', async () => {
  const open = jest.fn();
  const assistantOpen = jest.fn(
    async () =>
      ({
        scope: 'assistant:grant',
        draftScope: 'assistant:binding',
        getState: () => ({ status: 'ready' }),
        getStarts: () => [],
        subscribeOperations: () => () => {},
        subscribeState: () => () => {},
        dispose: jest.fn(),
      }) as unknown as RemoteAgentSource,
  );
  const owner = createConversationSources({
    agent: {} as AgentProtocol,
    api: {} as ApiClient,
    remoteAgent: { open },
    remoteAssistant: { open: assistantOpen },
    onSessionChanged() {},
  });
  const retained = await owner.open(
    { kind: 'desktop', connectionId: 'pc', domain: 'assistant' },
    new AbortController().signal,
  );
  expect(retained.source.ref).toEqual({ kind: 'desktop', connectionId: 'pc', domain: 'assistant' });
  expect(retained.source.catalog.listWorkspaces).toBeUndefined();
  expect(open).not.toHaveBeenCalled();
  retained.release();
  owner.dispose();
});

test('shared catalog readers release connection demand only after the last consumer', async () => {
  const handles: RemoteAgentSource[] = [];
  let generation = 'first';
  const owner = createConversationSources({
    agent: {} as AgentProtocol,
    api: {} as ApiClient,
    remoteAssistant: { open: jest.fn() },
    remoteAgent: {
      open: async () => {
        const handle = {
          scope: generation,
          draftScope: 'binding',
          getState: () => ({ status: 'ready' }),
          getStarts: () => [],
          subscribeOperations: () => () => {},
          subscribeState: () => () => {},
          listAgents: jest.fn(async () => ({ items: [{ id: 'a', name: 'Agent' }] })),
          dispose: jest.fn(),
        } as unknown as RemoteAgentSource;
        handles.push(handle);
        return handle;
      },
    } as RemoteAgentModule,
    onSessionChanged() {},
  });
  const ref = { kind: 'desktop' as const, domain: 'agent' as const, connectionId: 'pc' };
  const signal = new AbortController().signal;
  const [first, second] = await Promise.all([owner.open(ref, signal), owner.open(ref, signal)]);
  expect(first.source).toBe(second.source);
  expect(handles[1].dispose).toHaveBeenCalledTimes(1);
  first.release();
  first.release();
  expect(handles[0].dispose).not.toHaveBeenCalled();
  await expect(second.source.catalog.listAgents(undefined, signal)).resolves.toMatchObject({
    items: [{ name: 'Agent' }],
  });
  second.release();
  expect(handles[0].dispose).toHaveBeenCalledTimes(1);
  generation = 'second';
  const reopened = await owner.open(ref, signal);
  expect(reopened.source).not.toBe(first.source);
  expect(reopened.source.catalog.cacheScope).toBe(first.source.catalog.cacheScope);
  reopened.release();
  owner.dispose();
});
