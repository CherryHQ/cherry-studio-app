import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { queryKeys } from '@/frontend/data';
import { BackendProvider } from '@/frontend/data/BackendProvider';
import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import type { Backend, McpPromptEntry } from '@/shared/contracts';
import type { ApiClient } from '@/shared/data/api/types';
import type { RemoteMcpServer } from '@/shared/data/types/mcpServer';

import { useCachedMcpPrompts, useMcpServerMutations } from '../useMcpServers';

const mockInvalidateQueries = jest.fn<Promise<void>, [unknown]>(async () => undefined);
const mockDelete = jest.fn(async (): Promise<void> => undefined);
const mockPatch = jest.fn();
const mockPost = jest.fn();
const dataApi = {
  delete: mockDelete,
  get: jest.fn(),
  patch: mockPatch,
  post: mockPost,
  put: jest.fn(),
} as unknown as ApiClient;

let actions: ReturnType<typeof useMcpServerMutations> | undefined;
let queryClient: QueryClient;
let renderer: ReactTestRenderer | undefined;

function Probe() {
  const result = useMcpServerMutations();
  useEffect(() => {
    actions = result;
  }, [result]);
  return null;
}

function makeServer(overrides: Partial<RemoteMcpServer> = {}): RemoteMcpServer {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    disabledTools: [],
    endpointUrl: 'https://a.example/mcp',
    id: 'server-1',
    isEnabled: true,
    name: 'Server',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('useMcpServerMutations', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    actions = undefined;
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { gcTime: Infinity, retry: false } },
    });
    jest.spyOn(queryClient, 'invalidateQueries').mockImplementation(mockInvalidateQueries);
    jest.spyOn(queryClient, 'setQueryData');
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
    queryClient.clear();
  });

  it('keeps the tools cache when the backend reports unchanged tools', async () => {
    const server = makeServer({ name: 'Renamed' });
    mockPatch.mockResolvedValue({ server, toolsChanged: false });

    await act(async () => {
      await actions?.updateServer(server.id, { name: 'Renamed' });
    });

    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      queryKeys.mcpServers.detail(server.id),
      server,
    );
    expect(mockPatch).toHaveBeenCalledWith(`/mcp-servers/${server.id}`, {
      body: { name: 'Renamed' },
      query: undefined,
    });
    expect(mockInvalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.mcpServers.tools(server.id),
    });
  });

  it('invalidates the tools cache when the backend reports a transport change', async () => {
    const server = makeServer({ endpointUrl: 'https://b.example/mcp' });
    mockPatch.mockResolvedValue({ server, toolsChanged: true });

    await act(async () => {
      await actions?.updateServer(server.id, { endpointUrl: server.endpointUrl });
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.mcpServers.tools(server.id),
    });
  });

  it('hydrates a server created through the data endpoint', async () => {
    const server = makeServer();
    mockPost.mockResolvedValue(server);

    await act(async () => {
      await actions?.createServer({ endpointUrl: server.endpointUrl, name: server.name });
    });

    expect(mockPost).toHaveBeenCalledWith('/mcp-servers', {
      body: { endpointUrl: server.endpointUrl, name: server.name },
      query: undefined,
    });
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      queryKeys.mcpServers.detail(server.id),
      server,
    );
  });

  it('does not keep delete pending while cache invalidation settles', async () => {
    const pendingInvalidation = deferred<void>();
    mockInvalidateQueries.mockImplementationOnce(() => pendingInvalidation.promise);

    const deletion = actions?.deleteServer('server-1');
    await expect(deletion).resolves.toBeUndefined();
    expect(mockDelete).toHaveBeenCalledWith('/mcp-servers/server-1', { query: undefined });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.mcpServers.all(),
    });

    pendingInvalidation.resolve();
    await pendingInvalidation.promise;
  });

  it('restores the server list when an optimistic delete fails', async () => {
    const server = makeServer();
    const pendingDelete = deferred<void>();
    mockDelete.mockImplementationOnce(() => pendingDelete.promise);
    queryClient.setQueryData(queryKeys.mcpServers.all(), { items: [server], total: 1 });

    let deletion: Promise<void> | undefined;
    await act(async () => {
      deletion = actions?.deleteServer(server.id);
      await Promise.resolve();
    });
    expect(queryClient.getQueryData(queryKeys.mcpServers.all())).toEqual({ items: [], total: 0 });

    pendingDelete.reject(new Error('delete failed'));
    await act(async () => {
      await expect(deletion).rejects.toThrow('delete failed');
    });

    expect(queryClient.getQueryData(queryKeys.mcpServers.all())).toEqual({
      items: [server],
      total: 1,
    });
  });
});

describe('useCachedMcpPrompts', () => {
  it('refetches updated cached prompts when remounted after prompt changes occurred while closed', async () => {
    let cached: Record<string, readonly McpPromptEntry[]> = {};
    const getCachedPrompts = jest.fn(async () => cached);
    const unsubscribe = jest.fn();
    const subscribePromptCatalogs = jest.fn(() => unsubscribe);
    const backend = {
      mcp: { getCachedPrompts, subscribePromptCatalogs },
    } as unknown as Backend;
    const promptsQueryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity, retry: false } },
    });
    let latestPrompts: Readonly<Record<string, readonly McpPromptEntry[]>> = {};

    function PromptProbe({ enabled }: { enabled: boolean }) {
      const prompts = useCachedMcpPrompts({ enabled });
      useEffect(() => {
        latestPrompts = prompts;
      }, [prompts]);
      return null;
    }

    let promptRenderer: ReactTestRenderer | undefined;
    const mountProbe = () => (
      <QueryClientProvider client={promptsQueryClient}>
        <BackendProvider backend={backend}>
          <PromptProbe enabled />
        </BackendProvider>
      </QueryClientProvider>
    );
    try {
      await act(async () => {
        promptRenderer = create(mountProbe());
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(getCachedPrompts).toHaveBeenCalledTimes(1);
      expect(subscribePromptCatalogs).toHaveBeenCalledTimes(1);
      expect(latestPrompts).toEqual({});

      await act(async () => {
        promptRenderer?.unmount();
        promptRenderer = undefined;
      });
      expect(unsubscribe).toHaveBeenCalledTimes(1);

      cached = {
        'server-1': [
          {
            kind: 'prompt',
            key: 'summarize',
            title: 'Summarize',
            description: 'Summarize',
            arguments: [],
          },
        ],
      };

      await act(async () => {
        promptRenderer = create(mountProbe());
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(getCachedPrompts).toHaveBeenCalledTimes(2);
      expect(latestPrompts).toEqual(cached);
    } finally {
      await act(async () => promptRenderer?.unmount());
      promptsQueryClient.clear();
    }
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}
