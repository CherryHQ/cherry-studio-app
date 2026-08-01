import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import type { ApiClient } from '@cherrystudio/universal/data/api/types';

import { __testing, useMutation, useQuery } from '../useDataApi';

const dataApi = {
  delete: jest.fn(),
  get: jest.fn(),
  patch: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
} as jest.Mocked<ApiClient>;

let queryClient: QueryClient;
let renderer: ReactTestRenderer | undefined;

function TestProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <DataApiProvider dataApi={dataApi}>{children}</DataApiProvider>
    </QueryClientProvider>
  );
}

describe('Data API hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { gcTime: Infinity, retry: false },
      },
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    queryClient.clear();
  });

  it('resolves a template path and forwards its typed query', async () => {
    dataApi.get.mockResolvedValueOnce({ id: 'provider-1', name: 'Provider' } as never);

    function Probe() {
      useQuery('/providers/:id', {
        params: { id: 'provider-1' },
      });
      return null;
    }

    await act(async () => {
      renderer = create(
        <TestProviders>
          <Probe />
        </TestProviders>,
      );
    });

    expect(dataApi.get).toHaveBeenCalledWith('/providers/provider-1', {
      query: undefined,
    });
  });

  it('dispatches a mutation and invalidates matching endpoint keys', async () => {
    dataApi.patch.mockResolvedValueOnce({ id: 'assistant-1', name: 'Updated' } as never);
    queryClient.setQueryData(['/assistants'], { items: [] });
    const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
    let trigger:
      | ((args: { body: { name: string }; params: { id: string } }) => Promise<unknown>)
      | undefined;

    function Probe() {
      const mutation = useMutation('PATCH', '/assistants/:id', {
        refresh: ['/assistants'],
      });
      useEffect(() => {
        trigger = mutation.trigger;
      }, [mutation.trigger]);
      return null;
    }

    await act(async () => {
      renderer = create(
        <TestProviders>
          <Probe />
        </TestProviders>,
      );
    });
    await act(async () => {
      await trigger?.({ body: { name: 'Updated' }, params: { id: 'assistant-1' } });
    });

    expect(dataApi.patch).toHaveBeenCalledWith('/assistants/assistant-1', {
      body: { name: 'Updated' },
      query: undefined,
    });
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
  });
});

describe('Data API key utilities', () => {
  it('keeps template and concrete query keys equivalent', () => {
    const query = { limit: 20 };
    expect(
      __testing.buildQueryKey(__testing.resolveTemplate('/topics/:id', { id: 'topic-1' }), query),
    ).toEqual(__testing.buildQueryKey('/topics/topic-1', query));
  });

  it('matches exact paths and explicit resource wildcards', () => {
    expect(__testing.matchesPath('/providers', '/providers')).toBe(true);
    expect(__testing.matchesPath('/providers/provider-1', '/providers')).toBe(false);
    expect(__testing.matchesPath('/providers/provider-1', '/providers/*')).toBe(true);
    expect(__testing.matchesPath('/providers-archived/provider-1', '/providers/*')).toBe(false);
  });
});
