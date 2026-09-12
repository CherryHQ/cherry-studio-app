import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import type { ApiClient } from '@/shared/data/api/types';
import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';

import { useAgentToolBindingMutations, useAgentToolBindingsApi } from '../useAgentToolBindings';

const AGENT_ID = '00000000-0000-4000-8000-000000000001';
const SERVER_ID = '00000000-0000-4000-8000-000000000002';
const persistedBinding: AgentToolBinding = {
  agentId: AGENT_ID,
  approval: 'ask',
  createdAt: '2026-08-26T00:00:00.000Z',
  displayNameSnapshot: 'Search',
  enabled: true,
  id: '00000000-0000-4000-8000-000000000003',
  serverId: SERVER_ID,
  source: 'mcp',
  updatedAt: '2026-08-26T00:00:00.000Z',
};

let actions: ReturnType<typeof useAgentToolBindingMutations> | undefined;
let queryClient: QueryClient;
let renderer: ReactTestRenderer | undefined;

const dataApi = {
  delete: jest.fn(),
  get: jest.fn(async () => ({ items: [persistedBinding] })),
  patch: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
} as unknown as ApiClient;

function Probe() {
  useAgentToolBindingsApi(AGENT_ID);
  const mutations = useAgentToolBindingMutations();

  useEffect(() => {
    actions = mutations;
  }, [mutations]);

  return null;
}

describe('useAgentToolBindingMutations', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    actions = undefined;
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

  it('uses one replace request and reconciles the cache after a failure', async () => {
    (dataApi.put as jest.Mock).mockRejectedValueOnce(new Error('write failed'));

    await act(async () => {
      await expect(actions?.replaceAgentToolBindings(AGENT_ID, [])).rejects.toThrow('write failed');
    });

    expect(dataApi.put).toHaveBeenCalledTimes(1);
    expect(dataApi.put).toHaveBeenCalledWith(`/agents/${AGENT_ID}/tool-bindings`, {
      body: { bindings: [] },
      query: undefined,
    });
    expect(dataApi.get).toHaveBeenCalledTimes(2);
    expect(
      queryClient.getQueryData<{ items: AgentToolBinding[] }>([
        `/agents/${AGENT_ID}/tool-bindings`,
      ]),
    ).toEqual({ items: [persistedBinding] });
  });
});
