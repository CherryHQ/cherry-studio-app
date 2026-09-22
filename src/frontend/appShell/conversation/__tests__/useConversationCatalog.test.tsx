import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ConversationSource, AgentSummary, CatalogPage } from '../contracts';
import { createConversationState } from '../conversationState';
import { useConversationAgents } from '../useConversationCatalog';

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
      state,
      operations: createConversationState([]),
      catalog: {
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
  it('releases only the exiting consumer and never installs its late read', async () => {
    await act(async () => {
      tree = create(render());
    });
    expect(requests).toHaveLength(2);
    await act(async () => tree.update(render(false)));
    expect(requests[0].signal.aborted).toBe(true);
    expect(requests[1].signal.aborted).toBe(false);
    await act(async () => {
      requests[1].resolve({
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
    await act(async () => {
      requests[0].resolve({ items: [] });
      await tick();
    });
    await waitForCatalog('b');
    expect(results.get('b')?.items[0].name).toBe('Visible');
    expect(query.getQueryCache().getAll()).toHaveLength(1);
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
});
