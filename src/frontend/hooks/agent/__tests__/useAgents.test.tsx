import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import type { ApiClient } from '@/shared/data/api/types';
import type { Agent } from '@/shared/data/types/agent';

import { useAgentMutations, useAgentsApi } from '../useAgents';

let actions: ReturnType<typeof useAgentMutations> | undefined;
let queryClient: QueryClient;
let renderer: ReactTestRenderer | undefined;

const agents = [makeAgent('a'), makeAgent('b'), makeAgent('c')];
const deleteA = deferred<void>();
const deleteB = deferred<void>();
let persistedAgents = agents;

const dataApi = {
  delete: jest.fn((path: string) => {
    if (path.endsWith('/a')) return deleteA.promise;
    if (path.endsWith('/b')) return deleteB.promise;
    return Promise.resolve({ deleted: true });
  }),
  get: jest.fn(async () => ({
    items: persistedAgents,
    page: 1,
    total: persistedAgents.length,
  })),
  patch: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
} as unknown as ApiClient;

function Probe() {
  useAgentsApi();
  const mutations = useAgentMutations();

  useEffect(() => {
    actions = mutations;
  }, [mutations]);

  return null;
}

describe('useAgentMutations', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    actions = undefined;
    persistedAgents = agents;
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { gcTime: Infinity, retry: false } },
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
      deletion = actions?.deleteAgents(['a', 'b', 'a']);
      await Promise.resolve();
    });

    expect(readAgentIds()).toEqual(['c']);

    persistedAgents = [agents[1], agents[2]];
    deleteA.resolve();
    deleteB.reject(new Error('delete b failed'));

    await act(async () => {
      await expect(deletion).rejects.toThrow('delete b failed');
    });

    expect(readAgentIds()).toEqual(['b', 'c']);
    expect(dataApi.delete).toHaveBeenCalledTimes(2);
  });
});

function readAgentIds() {
  return (
    queryClient.getQueryData<{ items: Agent[] }>(['/agents', { limit: 500 }])?.items ?? []
  ).map((agent) => agent.id);
}

function makeAgent(id: string): Agent {
  return { id, name: id.toUpperCase() } as Agent;
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
