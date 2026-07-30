import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { BackendProvider, queryKeys } from '@/frontend/data';
import type { McpBackend, MobileBackend } from '@/shared/contracts';
import type { StreamableHttpMcpServer } from '@/shared/data/types/mcpServer';
import { useMcpServerMutations } from '../useMcpServers';

const mockInvalidateQueries = jest.fn<Promise<void>, [unknown]>(async () => undefined);
const mockSetQueryData = jest.fn();
const mockCreateServer = jest.fn<
  ReturnType<McpBackend['createServer']>,
  Parameters<McpBackend['createServer']>
>();
const mockRemoveServer = jest.fn<
  ReturnType<McpBackend['removeServer']>,
  Parameters<McpBackend['removeServer']>
>();
const mockUpdateServer = jest.fn<
  ReturnType<McpBackend['updateServer']>,
  Parameters<McpBackend['updateServer']>
>();
const backend = {
  mcp: {
    createServer: mockCreateServer,
    removeServer: mockRemoveServer,
    updateServer: mockUpdateServer,
  },
} as unknown as MobileBackend;

jest.mock('@tanstack/react-query', () => ({
  useMutation: (config: {
    mutationFn: (variables: unknown) => Promise<unknown>;
    onSuccess?: (data: unknown, variables: unknown) => Promise<void> | void;
  }) => ({
    isPending: false,
    mutateAsync: async (variables: unknown) => {
      const data = await config.mutationFn(variables);
      await config.onSuccess?.(data, variables);
      return data;
    },
  }),
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
    setQueryData: mockSetQueryData,
  }),
}));

let actions: ReturnType<typeof useMcpServerMutations> | undefined;
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
    mockRemoveServer.mockResolvedValue(undefined);
    await act(async () => {
      renderer = create(
        <BackendProvider backend={backend}>
          <Probe />
        </BackendProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('keeps the tools cache when the backend reports unchanged tools', async () => {
    const server = makeServer({ disabledTools: ['search'] });
    mockUpdateServer.mockResolvedValue({ server, toolsChanged: false });

    await act(async () => {
      await actions?.updateServer(server.id, { disabledTools: ['search'] });
    });

    expect(mockSetQueryData).toHaveBeenCalledWith(queryKeys.mcpServers.detail(server.id), server);
    expect(mockInvalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.mcpServers.tools(server.id),
    });
  });

  it('invalidates the tools cache when the backend reports a transport change', async () => {
    const server = makeServer({ baseUrl: 'https://b.example/mcp' });
    mockUpdateServer.mockResolvedValue({ server, toolsChanged: true });

    await act(async () => {
      await actions?.updateServer(server.id, { baseUrl: server.baseUrl });
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.mcpServers.tools(server.id),
    });
  });

  it('hydrates a created server and delegates runtime effects to the backend', async () => {
    const server = makeServer();
    mockCreateServer.mockResolvedValue(server);

    await act(async () => {
      await actions?.createServer({ baseUrl: server.baseUrl, name: server.name });
    });

    expect(mockCreateServer).toHaveBeenCalledWith({ baseUrl: server.baseUrl, name: server.name });
    expect(mockSetQueryData).toHaveBeenCalledWith(queryKeys.mcpServers.detail(server.id), server);
  });

  it('does not keep delete pending while cache invalidation settles', async () => {
    const pendingInvalidation = deferred<void>();
    mockInvalidateQueries.mockImplementationOnce(() => pendingInvalidation.promise);

    const deletion = actions?.deleteServer('server-1');
    await expect(deletion).resolves.toBeUndefined();
    expect(mockRemoveServer).toHaveBeenCalledWith('server-1');
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
