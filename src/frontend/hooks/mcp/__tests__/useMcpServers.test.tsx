import type { ApiClient } from '@cherrystudio/universal/data/api/types';
import type { StreamableHttpMcpServer } from '@cherrystudio/universal/data/types/mcpServer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { queryKeys } from '@/frontend/data';
import { DataApiProvider } from '@/frontend/data/DataApiProvider';

import { useMcpServerMutations } from '../useMcpServers';

const mockInvalidateQueries = jest.fn<Promise<void>, [unknown]>(async () => undefined);
const mockSetQueryData = jest.fn();
const mockDelete = jest.fn(async () => undefined);
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

function makeServer(overrides: Partial<StreamableHttpMcpServer> = {}): StreamableHttpMcpServer {
  return {
    baseUrl: 'https://a.example/mcp',
    createdAt: '2026-01-01T00:00:00.000Z',
    description: '',
    disabledAutoApproveTools: [],
    disabledTools: [],
    headers: {},
    id: 'server-1',
    isActive: true,
    name: 'Server',
    type: 'streamableHttp',
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
    jest.spyOn(queryClient, 'setQueryData').mockImplementation(mockSetQueryData);
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
    const server = makeServer({ disabledTools: ['search'] });
    mockPatch.mockResolvedValue({ server, toolsChanged: false });

    await act(async () => {
      await actions?.updateServer(server.id, { disabledTools: ['search'] });
    });

    expect(mockSetQueryData).toHaveBeenCalledWith(queryKeys.mcpServers.detail(server.id), server);
    expect(mockPatch).toHaveBeenCalledWith(`/mcp-servers/${server.id}`, {
      body: { disabledTools: ['search'] },
      query: undefined,
    });
    expect(mockInvalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.mcpServers.tools(server.id),
    });
  });

  it('invalidates the tools cache when the backend reports a transport change', async () => {
    const server = makeServer({ baseUrl: 'https://b.example/mcp' });
    mockPatch.mockResolvedValue({ server, toolsChanged: true });

    await act(async () => {
      await actions?.updateServer(server.id, { baseUrl: server.baseUrl });
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.mcpServers.tools(server.id),
    });
  });

  it('hydrates a server created through the data endpoint', async () => {
    const server = makeServer();
    mockPost.mockResolvedValue(server);

    await act(async () => {
      await actions?.createServer({ baseUrl: server.baseUrl, name: server.name });
    });

    expect(mockPost).toHaveBeenCalledWith('/mcp-servers', {
      body: { baseUrl: server.baseUrl, name: server.name },
      query: undefined,
    });
    expect(mockSetQueryData).toHaveBeenCalledWith(queryKeys.mcpServers.detail(server.id), server);
  });

  it('does not keep delete pending while cache invalidation settles', async () => {
    const pendingInvalidation = deferred<void>();
    mockInvalidateQueries.mockImplementationOnce(() => pendingInvalidation.promise);

    const deletion = actions?.deleteServer('server-1');
    await expect(deletion).resolves.toBeUndefined();
    expect(mockDelete).toHaveBeenCalledWith('/mcp-servers/server-1', { query: undefined });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.assistants.all(),
    });

    pendingInvalidation.resolve();
    await pendingInvalidation.promise;
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
