import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import type { ApiClient } from '@/shared/data/api/types';

import { __testing, useInfiniteQuery, useMutation, useQuery } from '../useDataApi';

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

  it('inherits the client staleTime when a caller does not set one', async () => {
    // react-query merges `{...clientDefaults, ...options}`, so forwarding an unset
    // `staleTime` as an explicit `undefined` would wipe the client default and leave every
    // query permanently stale — remounting a screen would refetch what it just loaded.
    queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity, retry: false, staleTime: 30_000 } },
    });
    dataApi.get.mockResolvedValue({ items: [] } as never);

    function Probe() {
      useQuery('/providers');
      return null;
    }

    async function mountProbe() {
      let probeRenderer: ReactTestRenderer | undefined;
      await act(async () => {
        probeRenderer = create(
          <TestProviders>
            <Probe />
          </TestProviders>,
        );
      });
      await act(async () => probeRenderer?.unmount());
    }

    await mountProbe();
    await mountProbe();

    expect(dataApi.get).toHaveBeenCalledTimes(1);
  });

  it('keeps disabled template query keys scoped to their resolved identity', async () => {
    function Probe() {
      useQuery('/providers/:id', {
        enabled: false,
        params: { id: 'provider-1' },
      });
      useQuery('/providers/:id', {
        enabled: false,
        params: { id: 'provider-2' },
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

    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual([['/providers/provider-1'], ['/providers/provider-2']]);
    expect(dataApi.get).not.toHaveBeenCalled();
  });

  it('keeps disabled infinite-query keys scoped to their resolved identity', async () => {
    function Probe() {
      useInfiniteQuery('/agent-sessions/:sessionId/messages', {
        enabled: false,
        params: { sessionId: 'session-1' },
      });
      useInfiniteQuery('/agent-sessions/:sessionId/messages', {
        enabled: false,
        params: { sessionId: 'session-2' },
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

    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual([
      ['/agent-sessions/session-1/messages', { limit: 10 }],
      ['/agent-sessions/session-2/messages', { limit: 10 }],
    ]);
    expect(dataApi.get).not.toHaveBeenCalled();
  });

  it('holds the previous key on screen while the next one loads', async () => {
    let resolveSecondPage: ((value: unknown) => void) | undefined;
    dataApi.get.mockResolvedValueOnce({ id: 'agent-1' } as never);
    dataApi.get.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSecondPage = resolve;
      }) as never,
    );
    let latest: ReturnType<typeof useQuery> | undefined;

    function Probe({ id }: { id: string }) {
      const result = useQuery('/agents/:id', {
        keepPreviousData: true,
        params: { id },
      });
      useEffect(() => {
        latest = result;
      }, [result]);
      return null;
    }

    async function renderProbe(id: string) {
      await act(async () => {
        const element = (
          <TestProviders>
            <Probe id={id} />
          </TestProviders>
        );
        if (renderer) renderer.update(element);
        else renderer = create(element);
      });
      await flushQueryNotifications();
    }

    async function flushQueryNotifications() {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    await renderProbe('agent-1');
    expect(latest?.data).toEqual({ id: 'agent-1' });

    await renderProbe('agent-2');
    expect(latest?.isLoading).toBe(false);
    expect(latest?.data).toEqual({ id: 'agent-1' });

    await act(async () => resolveSecondPage?.({ id: 'agent-2' }));
    await flushQueryNotifications();
    expect(latest?.data).toEqual({ id: 'agent-2' });
  });

  it('dispatches a mutation and invalidates matching endpoint keys', async () => {
    dataApi.patch.mockResolvedValueOnce({ id: 'agent-1', name: 'Updated' } as never);
    queryClient.setQueryData(['/agents'], { items: [] });
    const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
    let trigger:
      | ((args: { body: { name: string }; params: { id: string } }) => Promise<unknown>)
      | undefined;

    function Probe() {
      const mutation = useMutation('PATCH', '/agents/:id', {
        refresh: ['/agents'],
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
      await trigger?.({ body: { name: 'Updated' }, params: { id: 'agent-1' } });
    });

    expect(dataApi.patch).toHaveBeenCalledWith('/agents/agent-1', {
      body: { name: 'Updated' },
      query: undefined,
    });
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
  });

  describe('useMutation optimistic lifecycle', () => {
    const variables = { body: { name: 'Updated' }, params: { id: 'agent-1' } };
    let trigger: ((args: typeof variables) => Promise<unknown>) | undefined;

    beforeEach(() => {
      trigger = undefined;
    });

    async function mountProbe(probe: React.ReactElement) {
      await act(async () => {
        renderer = create(<TestProviders>{probe}</TestProviders>);
      });
    }

    it('runs the lifecycle callbacks and refresh in order around the request', async () => {
      const calls: string[] = [];
      const response = { id: 'agent-1', name: 'Updated' };
      dataApi.patch.mockImplementationOnce(async () => {
        calls.push('mutationFn');
        return response as never;
      });
      jest.spyOn(queryClient, 'invalidateQueries').mockImplementation(async () => {
        calls.push('invalidate');
      });
      const refresh = jest.fn(() => ['/agents']);

      function Probe() {
        const mutation = useMutation('PATCH', '/agents/:id', {
          onError: () => {
            calls.push('onError');
          },
          onMutate: () => {
            calls.push('onMutate');
          },
          onSettled: () => {
            calls.push('onSettled');
          },
          onSuccess: () => {
            calls.push('onSuccess');
          },
          refresh,
        });
        useEffect(() => {
          trigger = mutation.trigger;
        }, [mutation.trigger]);
        return null;
      }

      await mountProbe(<Probe />);
      let resolved: unknown;
      await act(async () => {
        resolved = await trigger?.(variables);
      });

      expect(resolved).toEqual(response);
      expect(calls).toEqual(['onMutate', 'mutationFn', 'invalidate', 'onSuccess', 'onSettled']);
      expect(refresh).toHaveBeenCalledWith({ args: variables, result: response });
    });

    it('passes the trigger variables and onMutate context to onSuccess and onSettled', async () => {
      const response = { id: 'agent-1', name: 'Updated' };
      dataApi.patch.mockResolvedValueOnce(response as never);
      const context = { previousName: 'Original' };
      const onSettled = jest.fn();
      const onSuccess = jest.fn();

      function Probe() {
        const mutation = useMutation('PATCH', '/agents/:id', {
          onMutate: () => context,
          onSettled,
          onSuccess,
        });
        useEffect(() => {
          trigger = mutation.trigger;
        }, [mutation.trigger]);
        return null;
      }

      await mountProbe(<Probe />);
      await act(async () => {
        await trigger?.(variables);
      });

      expect(onSuccess).toHaveBeenCalledWith(response, variables, context);
      expect(onSettled).toHaveBeenCalledWith(response, null, variables, context);
    });

    it('waits for an async onMutate before the request and forwards its resolved context', async () => {
      dataApi.patch.mockResolvedValueOnce({ id: 'agent-1', name: 'Updated' } as never);
      const onSuccess = jest.fn();
      let resolveContext: ((context: { snapshot: string }) => void) | undefined;

      function Probe() {
        const mutation = useMutation('PATCH', '/agents/:id', {
          onMutate: () =>
            new Promise<{ snapshot: string }>((resolve) => {
              resolveContext = resolve;
            }),
          onSuccess,
        });
        useEffect(() => {
          trigger = mutation.trigger;
        }, [mutation.trigger]);
        return null;
      }

      await mountProbe(<Probe />);
      let pending: Promise<unknown> | undefined;
      await act(async () => {
        pending = trigger?.(variables);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(dataApi.patch).not.toHaveBeenCalled();

      await act(async () => {
        resolveContext?.({ snapshot: 'agents' });
        await pending;
      });

      expect(dataApi.patch).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith({ id: 'agent-1', name: 'Updated' }, variables, {
        snapshot: 'agents',
      });
    });

    it('reports the error with variables and context and skips refresh on failure', async () => {
      const requestError = new Error('patch failed');
      dataApi.patch.mockRejectedValueOnce(requestError);
      const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
      const onError = jest.fn();
      const onSettled = jest.fn();
      const onSuccess = jest.fn();
      let latest: { error?: Error } | undefined;

      function Probe() {
        const mutation = useMutation('PATCH', '/agents/:id', {
          onError,
          onMutate: () => ({ previousName: 'Original' }),
          onSettled,
          onSuccess,
          refresh: ['/agents'],
        });
        useEffect(() => {
          trigger = mutation.trigger;
          latest = mutation;
        }, [mutation]);
        return null;
      }

      await mountProbe(<Probe />);
      await act(async () => {
        await expect(trigger?.(variables)).rejects.toThrow('patch failed');
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(onError).toHaveBeenCalledWith(requestError, variables, { previousName: 'Original' });
      expect(onSettled).toHaveBeenCalledWith(undefined, requestError, variables, {
        previousName: 'Original',
      });
      expect(onSuccess).not.toHaveBeenCalled();
      expect(invalidateQueries).not.toHaveBeenCalled();
      expect(latest?.error).toBe(requestError);
    });

    it('lets onError roll back an optimistic cache update from the onMutate context', async () => {
      const original = { items: [{ id: 'agent-1', name: 'Original' }] };
      queryClient.setQueryData(['/agents'], original);
      let cacheDuringRequest: unknown;
      dataApi.patch.mockImplementationOnce(async () => {
        cacheDuringRequest = queryClient.getQueryData(['/agents']);
        throw new Error('patch failed');
      });

      function Probe() {
        const mutation = useMutation('PATCH', '/agents/:id', {
          onError: (_error, _variables, context) => {
            queryClient.setQueryData(['/agents'], context?.previous);
          },
          onMutate: () => {
            const previous = queryClient.getQueryData(['/agents']);
            queryClient.setQueryData(['/agents'], {
              items: [{ id: 'agent-1', name: 'Updated' }],
            });
            return { previous };
          },
        });
        useEffect(() => {
          trigger = mutation.trigger;
        }, [mutation.trigger]);
        return null;
      }

      await mountProbe(<Probe />);
      await act(async () => {
        await expect(trigger?.(variables)).rejects.toThrow('patch failed');
      });

      expect(cacheDuringRequest).toEqual({ items: [{ id: 'agent-1', name: 'Updated' }] });
      expect(queryClient.getQueryData(['/agents'])).toEqual(original);
    });

    it('skips the request but still reports the failure when onMutate throws', async () => {
      const mutateError = new Error('onMutate failed');
      const onError = jest.fn();
      const onSettled = jest.fn();

      function Probe() {
        const mutation = useMutation('PATCH', '/agents/:id', {
          onError,
          onMutate: () => {
            throw mutateError;
          },
          onSettled,
        });
        useEffect(() => {
          trigger = mutation.trigger;
        }, [mutation.trigger]);
        return null;
      }

      await mountProbe(<Probe />);
      await act(async () => {
        await expect(trigger?.(variables)).rejects.toThrow('onMutate failed');
      });

      expect(dataApi.patch).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(mutateError, variables, undefined);
      expect(onSettled).toHaveBeenCalledWith(undefined, mutateError, variables, undefined);
    });

    it('still runs onError and onSettled when the success callback throws', async () => {
      dataApi.patch.mockResolvedValueOnce({ id: 'agent-1', name: 'Updated' } as never);
      const successError = new Error('onSuccess failed');
      const onError = jest.fn();
      const onSettled = jest.fn();

      function Probe() {
        const mutation = useMutation('PATCH', '/agents/:id', {
          onError,
          onMutate: () => ({ stage: 'before-request' }),
          onSettled,
          onSuccess: () => {
            throw successError;
          },
        });
        useEffect(() => {
          trigger = mutation.trigger;
        }, [mutation.trigger]);
        return null;
      }

      await mountProbe(<Probe />);
      await act(async () => {
        await expect(trigger?.(variables)).rejects.toThrow('onSuccess failed');
      });

      expect(onError).toHaveBeenCalledWith(successError, variables, { stage: 'before-request' });
      expect(onSettled).toHaveBeenCalledWith(undefined, successError, variables, {
        stage: 'before-request',
      });
    });

    it('keeps the legacy single-argument callbacks working unchanged', async () => {
      const response = { id: 'agent-1', name: 'Updated' };
      dataApi.patch.mockResolvedValueOnce(response as never);
      const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
      const seen: unknown[] = [];

      function Probe() {
        const mutation = useMutation('PATCH', '/agents/:id', {
          onError: (error) => {
            seen.push(error);
          },
          onSuccess: (data) => {
            seen.push(data.id);
          },
          refresh: ['/agents'],
        });
        useEffect(() => {
          trigger = mutation.trigger;
        }, [mutation.trigger]);
        return null;
      }

      await mountProbe(<Probe />);
      await act(async () => {
        await trigger?.(variables);
      });

      expect(seen).toEqual(['agent-1']);
      expect(invalidateQueries).toHaveBeenCalledTimes(1);
    });

    it('keeps path, variables, response and context statically typed', async () => {
      dataApi.patch.mockResolvedValueOnce({ id: 'agent-1', name: 'Updated' } as never);
      const seen: string[] = [];

      function Probe() {
        const mutation = useMutation('PATCH', '/agents/:id', {
          onMutate: () => ({ previous: 'Original' }),
          onSuccess: (data, args, context) => {
            seen.push(data.id, args?.params.id ?? '', context.previous);
            // @ts-expect-error the context only carries what onMutate returned
            void context.missing;
          },
        });
        const invalidBody = () =>
          // @ts-expect-error the body must match the PATCH /agents/:id schema
          mutation.trigger({ body: { bogus: true }, params: { id: 'agent-1' } });
        void invalidBody;
        useEffect(() => {
          trigger = mutation.trigger;
        }, [mutation.trigger]);
        return null;
      }

      await mountProbe(<Probe />);
      await act(async () => {
        await trigger?.(variables);
      });

      expect(seen).toEqual(['agent-1', 'agent-1', 'Original']);
    });
  });
});

describe('Data API key utilities', () => {
  it('keeps template and concrete query keys equivalent', () => {
    const query = { limit: 20 };
    expect(
      __testing.buildQueryKey(
        __testing.resolveTemplate('/agent-sessions/:id', { id: 'session-1' }),
        query,
      ),
    ).toEqual(__testing.buildQueryKey('/agent-sessions/session-1', query));
  });

  it('matches exact paths and explicit resource wildcards', () => {
    expect(__testing.matchesPath('/providers', '/providers')).toBe(true);
    expect(__testing.matchesPath('/providers/provider-1', '/providers')).toBe(false);
    expect(__testing.matchesPath('/providers/provider-1', '/providers/*')).toBe(true);
    expect(__testing.matchesPath('/providers-archived/provider-1', '/providers/*')).toBe(false);
  });
});
