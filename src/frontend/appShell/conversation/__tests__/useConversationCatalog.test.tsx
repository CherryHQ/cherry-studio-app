import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ConversationSource, AgentSummary, CatalogPage } from '../contracts';
import { createConversationState } from '../conversationState';
import { useConversationAgents, useConversationSummary } from '../useConversationCatalog';

let mockSource: ConversationSource;
jest.mock('../ConversationSourceBoundary', () => ({
  useConversationSource: () => mockSource,
  useConversationSourceState: () => {
    const { useSyncExternalStore } = jest.requireActual('react');
    return useSyncExternalStore(mockSource.state.subscribe, mockSource.state.getSnapshot);
  },
}));
const results = new Map<string, ReturnType<typeof useConversationAgents>>();
function Consumer({ id }: { id: string }) {
  results.set(id, useConversationAgents());
  return null;
}
let summary: ReturnType<typeof useConversationSummary>;
function Selected() {
  const current = useConversationSummary('selected');
  useEffect(() => {
    summary = current;
  });
  return null;
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function waitForCatalog(id: string) {
  const deadline = Date.now() + 1000;
  while (!results.get(id)?.isSuccess && Date.now() < deadline) await act(tick);
  expect(results.get(id)?.isSuccess).toBe(true);
}

describe('catalog consumer ownership', () => {
  let tree: ReactTestRenderer;
  let query: QueryClient;
  let state: ReturnType<
    typeof createConversationState<ReturnType<ConversationSource['state']['getSnapshot']>>
  >;
  const requests: { signal: AbortSignal; resolve(value: CatalogPage<AgentSummary>): void }[] = [];
  beforeEach(() => {
    results.clear();
    requests.length = 0;
    state = createConversationState<ReturnType<ConversationSource['state']['getSnapshot']>>({
      availability: { state: 'enabled' },
    });
    mockSource = {
      scope: 'scope',
      ref: { kind: 'desktop', connectionId: 'pc' },
      state,
      operations: createConversationState([]),
      catalog: {
        cacheScope: 'binding',
        listAgents: jest.fn(
          (_cursor, signal: AbortSignal) =>
            new Promise((resolve) => requests.push({ signal, resolve })),
        ),
      },
    } as unknown as ConversationSource;
    query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });
  afterEach(async () => {
    await act(async () => tree?.unmount());
    query.clear();
  });
  function render(second = true) {
    return (
      <QueryClientProvider client={query}>
        {second ? <Consumer key="a" id="a" /> : null}
        <Consumer key="b" id="b" />
      </QueryClientProvider>
    );
  }
  it('shares one request and keeps it alive when one reader exits', async () => {
    await act(async () => {
      tree = create(render());
    });
    expect(requests).toHaveLength(1);
    await act(async () => tree.update(render(false)));
    expect(requests[0].signal.aborted).toBe(false);
    await act(async () => {
      requests[0].resolve({
        items: [
          {
            id: 'a',
            ref: 'agent' as AgentSummary['ref'],
            name: 'Visible',
            configuration: 'unknown',
          },
        ],
      });
      await tick();
    });
    await waitForCatalog('b');
    expect(results.get('b')?.items[0].name).toBe('Visible');
    expect(query.getQueryCache().getAll()).toHaveLength(1);
  });
  it('retains metadata across remounts and refreshes it in the background', async () => {
    await act(async () => {
      tree = create(render(false));
    });
    await act(async () => {
      requests[0].resolve({
        items: [
          {
            id: 'a',
            ref: 'agent' as AgentSummary['ref'],
            name: 'Cached',
            emoji: '🧑🏽‍💻',
            configuration: 'unknown',
          },
        ],
      });
      await tick();
    });
    await waitForCatalog('b');
    await act(async () => tree.unmount());
    expect(query.getQueryCache().getAll()[0].state.data).toBeDefined();
    // A new runtime generation with the same pairing/grant reuses only metadata.
    mockSource = { ...mockSource, scope: 'replacement' as ConversationSource['scope'] };
    await act(async () => {
      tree = create(render(false));
    });
    expect(results.get('b')?.items[0]).toMatchObject({ name: 'Cached', emoji: '🧑🏽‍💻' });
    expect(requests).toHaveLength(2);
    await act(async () => {
      requests[1].resolve({
        items: [
          {
            id: 'a',
            ref: 'agent' as AgentSummary['ref'],
            name: 'Updated',
            configuration: 'unknown',
          },
        ],
      });
      await tick();
    });
    for (let i = 0; i < 20 && results.get('b')?.items[0]?.name !== 'Updated'; i++) await act(tick);
    expect(results.get('b')?.items[0]?.name).toBe('Updated');
  });
  it('cancels the last reader and never installs its late response', async () => {
    await act(async () => {
      tree = create(render(false));
    });
    await act(async () => tree.unmount());
    expect(requests[0].signal.aborted).toBe(true);
    await act(async () => {
      requests[0].resolve({
        items: [
          { id: 'a', ref: 'agent' as AgentSummary['ref'], name: 'Late', configuration: 'unknown' },
        ],
      });
      await tick();
    });
    expect(
      query
        .getQueryCache()
        .getAll()
        .every((entry) => entry.state.data === undefined),
    ).toBe(true);
  });
  it('does not expose a cached catalog to a replacement grant or another desktop', async () => {
    await act(async () => {
      tree = create(render(false));
    });
    await act(async () => {
      requests[0].resolve({
        items: [
          {
            id: 'a',
            ref: 'agent' as AgentSummary['ref'],
            name: 'Private',
            configuration: 'unknown',
          },
        ],
      });
      await tick();
    });
    await waitForCatalog('b');
    await act(async () => tree.unmount());
    mockSource = {
      ...mockSource,
      catalog: { ...mockSource.catalog, cacheScope: 'new-grant' as ConversationSource['scope'] },
    };
    await act(async () => {
      tree = create(render(false));
    });
    expect(results.get('b')?.items).toEqual([]);
    await act(async () => tree.unmount());
    mockSource = {
      ...mockSource,
      ref: { kind: 'desktop', connectionId: 'other' },
      catalog: { ...mockSource.catalog, cacheScope: 'binding' as ConversationSource['scope'] },
    };
    await act(async () => {
      tree = create(render(false));
    });
    expect(results.get('b')?.items).toEqual([]);
  });
  it('hides and evicts a retired source instead of reusing its catalog', async () => {
    await act(async () => {
      tree = create(render(false));
    });
    await act(async () => {
      requests[0].resolve({
        items: [
          {
            id: 'a',
            ref: 'agent' as AgentSummary['ref'],
            name: 'Private',
            configuration: 'unknown',
          },
        ],
      });
      await tick();
    });
    await waitForCatalog('b');
    expect(results.get('b')?.items).toHaveLength(1);
    await act(async () =>
      state.set({ availability: { state: 'disabled', reason: 'not-authorized' } }),
    );
    expect(results.get('b')?.items).toEqual([]);
    expect(
      query
        .getQueryCache()
        .getAll()
        .every((entry) => entry.state.data === undefined),
    ).toBe(true);
  });
  it('coalesces metadata changes and releases selected reads on retirement', async () => {
    const listeners = new Set<(kind: 'agents' | 'sessions') => void>();
    const readSession = jest.fn(async () => ({
      ref: { source: { kind: 'local' as const }, sessionId: 'selected' },
      agentId: 'agent',
      title: 'Before',
    }));
    mockSource.catalog.readSession = readSession;
    mockSource.catalog.subscribe = (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    };
    await act(async () => {
      tree = create(
        <QueryClientProvider client={query}>
          <Selected />
        </QueryClientProvider>,
      );
    });
    for (let i = 0; i < 20 && !summary.data; i++) await act(tick);
    expect(summary.data?.title).toBe('Before');
    readSession.mockResolvedValue({
      ref: { source: { kind: 'local' }, sessionId: 'selected' },
      agentId: 'agent',
      title: 'After',
    });
    await act(async () => {
      for (const listener of listeners) {
        listener('agents');
        listener('sessions');
        listener('sessions');
      }
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    for (let i = 0; i < 20 && summary.data?.title !== 'After'; i++) await act(tick);
    expect(summary.data?.title).toBe('After');
    expect(readSession).toHaveBeenCalledTimes(2);
    await act(async () => state.set({ availability: { state: 'disabled', reason: 'retired' } }));
    expect(summary.data).toBeUndefined();
    expect(
      query
        .getQueryCache()
        .getAll()
        .every((entry) => entry.state.data === undefined),
    ).toBe(true);
    await act(async () => {
      for (const listener of listeners) listener('sessions');
      tree.unmount();
    });
    expect(listeners.size).toBe(0);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(readSession).toHaveBeenCalledTimes(2);
  });
});
