import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import type { AgentSessionEntity } from '@/shared/data/api/schemas/agentSessions';
import type { ApiClient, CursorPaginationResponse } from '@/shared/data/api/types';

import {
  useAgentSessionMutations,
  useAgentSessions,
  useLatestAgentSession,
} from '../useAgentSessions';

let actions: ReturnType<typeof useAgentSessionMutations> | undefined;
let queryClient: QueryClient;
let renderer: ReactTestRenderer | undefined;

const sessions = [makeSession('a'), makeSession('b'), makeSession('c')];
const deleteA = deferred<void>();
const deleteB = deferred<void>();
const patchSession = jest.fn<Promise<AgentSessionEntity>, [string, unknown]>();
let persistedSessions = sessions;

const dataApi = {
  delete: jest.fn((path: string) => {
    if (path.endsWith('/a')) return deleteA.promise;
    if (path.endsWith('/b')) return deleteB.promise;
    return Promise.resolve(undefined);
  }),
  get: jest.fn(async () => ({ items: persistedSessions })),
  patch: patchSession,
  post: jest.fn(),
  put: jest.fn(),
} as unknown as ApiClient;

function Probe({ sessionId }: { sessionId?: string }) {
  useAgentSessions();
  // Both list variants share the collection cache namespace and therefore
  // must keep the same InfiniteData shape for optimistic rename/delete writes.
  useLatestAgentSession();
  const mutations = useAgentSessionMutations(sessionId);

  useEffect(() => {
    actions = mutations;
  }, [mutations]);

  return null;
}

describe('agent Session hooks', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    actions = undefined;
    persistedSessions = sessions;
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { gcTime: Infinity, retry: false, staleTime: 30_000 },
      },
    });
    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <DataApiProvider dataApi={dataApi}>
            <Probe />
          </DataApiProvider>
        </QueryClientProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    queryClient.clear();
  });

  it('removes a batch once and reconciles partial failure with the server', async () => {
    let deletion: Promise<unknown> | undefined;
    await act(async () => {
      deletion = actions?.deleteAgentSessions(['a', 'b', 'a']);
      await Promise.resolve();
    });

    expect(readSessionIds()).toEqual(['c']);

    persistedSessions = [sessions[1], sessions[2]];
    deleteA.resolve();
    deleteB.reject(new Error('delete b failed'));

    await act(async () => {
      await expect(deletion).rejects.toThrow('delete b failed');
    });

    expect(readSessionIds()).toEqual(['b', 'c']);
    expect(dataApi.delete).toHaveBeenCalledTimes(2);
  });

  it('requests the latest Session again on every mount', async () => {
    expect(dataApi.get).toHaveBeenCalledTimes(2);

    await act(async () => renderer?.unmount());
    renderer = undefined;
    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <DataApiProvider dataApi={dataApi}>
            <Probe />
          </DataApiProvider>
        </QueryClientProvider>,
      );
    });

    // The regular list remains fresh in cache; only the one-row latest query runs again.
    expect(dataApi.get).toHaveBeenCalledTimes(3);
  });

  it('serializes model saves to the same Session across composer mounts', async () => {
    const first = deferred<AgentSessionEntity>();
    const original = { ...makeSession('a'), updatedAt: '2026-11-18T00:00:00.000Z' };
    const intermediate = {
      ...original,
      model: 'p::first',
      updatedAt: '2026-11-18T00:00:00.001Z',
    } as const;
    const latest = {
      ...original,
      model: 'p::last',
      updatedAt: '2026-11-18T00:00:00.002Z',
    } as const;
    patchSession.mockReturnValueOnce(first.promise).mockResolvedValueOnce(latest);

    const render = (key: string) => (
      <QueryClientProvider client={queryClient}>
        <DataApiProvider dataApi={dataApi}>
          <Probe key={key} sessionId="a" />
        </DataApiProvider>
      </QueryClientProvider>
    );
    await act(async () => renderer?.update(render('first')));
    let firstSave: Promise<AgentSessionEntity> | undefined;
    await act(async () => {
      firstSave = actions?.updateAgentSession('a', { model: intermediate.model });
    });
    await act(async () => renderer?.update(render('second')));
    let lastSave: Promise<AgentSessionEntity> | undefined;
    await act(async () => {
      lastSave = actions?.updateAgentSession('a', { model: latest.model });
    });
    expect(dataApi.patch).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve(intermediate);
      await firstSave;
      await expect(lastSave).resolves.toEqual(latest);
    });
    expect(dataApi.patch).toHaveBeenLastCalledWith(
      '/agent-sessions/a',
      expect.objectContaining({ body: { model: latest.model } }),
    );
  });
});

function readSessionIds() {
  const data = queryClient.getQueryData<InfiniteData<CursorPaginationResponse<AgentSessionEntity>>>(
    ['/agent-sessions', { limit: 50 }],
  );
  return (data?.pages ?? []).flatMap((page) => page.items.map((session) => session.id));
}

function makeSession(id: string): AgentSessionEntity {
  return { id, name: id.toUpperCase() } as AgentSessionEntity;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}
