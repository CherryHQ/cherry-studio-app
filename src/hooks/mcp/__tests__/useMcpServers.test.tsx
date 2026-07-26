import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { queryKeys } from '@/data/api';
import type { StreamableHttpMcpServer } from '@/data/types/mcpServer';

import { useMcpServerMutations } from '../useMcpServers';

const mockInvalidateQueries = jest.fn(async () => undefined);
const mockInvalidateServer = jest.fn();
const mockWarmToolsCache = jest.fn(async (): Promise<void> => undefined);
const mockCreateServer = jest.fn();
const mockDeleteServer = jest.fn(async () => undefined);
const mockGetServer = jest.fn();
const mockUpdateServer = jest.fn();

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
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock('@/data/runtime', () => ({
  useDataServices: () => ({
    mcp: {
      invalidateServer: mockInvalidateServer,
      warmToolsCache: mockWarmToolsCache,
    },
    mobileMcpServer: {
      create: mockCreateServer,
      delete: mockDeleteServer,
      getById: mockGetServer,
      update: mockUpdateServer,
    },
  }),
}));

let actions: ReturnType<typeof useMcpServerMutations> | undefined;
let renderer: ReactTestRenderer | undefined;

function Probe() {
  actions = useMcpServerMutations();
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

describe('useMcpServerMutations runtime effects', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    actions = undefined;
    await act(async () => {
      renderer = create(<Probe />);
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('updates tool policy without touching the runtime or tools query', async () => {
    mockUpdateServer.mockResolvedValue(makeServer({ disabledTools: ['search'] }));

    await act(async () => {
      await actions?.updateServer('server-1', { disabledTools: ['search'] });
    });

    expect(mockGetServer).not.toHaveBeenCalled();
    expect(mockInvalidateServer).not.toHaveBeenCalled();
    expect(mockWarmToolsCache).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.mcpServers.tools('server-1'),
    });
  });

  it('leaves the runtime alone when a full save keeps the same transport', async () => {
    const server = makeServer({ headers: { Authorization: 'Bearer token' } });
    mockGetServer.mockResolvedValue(server);
    mockUpdateServer.mockResolvedValue({ ...server, name: 'Renamed', timeout: 10 });

    await act(async () => {
      await actions?.updateServer('server-1', {
        baseUrl: server.baseUrl,
        headers: { Authorization: 'Bearer token' },
        name: 'Renamed',
        timeout: 10,
      });
    });

    expect(mockInvalidateServer).not.toHaveBeenCalled();
    expect(mockWarmToolsCache).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.mcpServers.tools('server-1'),
    });
  });

  it('invalidates, refreshes tools, and warms only the changed server', async () => {
    mockGetServer.mockResolvedValue(makeServer());
    mockUpdateServer.mockResolvedValue(makeServer({ baseUrl: 'https://b.example/mcp' }));

    await act(async () => {
      await actions?.updateServer('server-1', { baseUrl: 'https://b.example/mcp' });
    });

    expect(mockInvalidateServer).toHaveBeenCalledWith('server-1');
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.mcpServers.tools('server-1'),
    });
    expect(mockWarmToolsCache).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://b.example/mcp', id: 'server-1' }),
    );
  });

  it('warms the enabled server and invalidates on disable', async () => {
    mockGetServer.mockResolvedValueOnce(makeServer({ isActive: false }));
    mockUpdateServer.mockResolvedValueOnce(makeServer({ isActive: true }));

    await act(async () => {
      await actions?.updateServer('server-1', { isActive: true });
    });

    expect(mockWarmToolsCache).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'server-1', isActive: true }),
    );
    expect(mockInvalidateServer).not.toHaveBeenCalled();

    jest.clearAllMocks();
    mockGetServer.mockResolvedValueOnce(makeServer({ isActive: true }));
    mockUpdateServer.mockResolvedValueOnce(makeServer({ isActive: false }));

    await act(async () => {
      await actions?.updateServer('server-1', { isActive: false });
    });

    expect(mockInvalidateServer).toHaveBeenCalledWith('server-1');
    expect(mockWarmToolsCache).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.mcpServers.tools('server-1'),
    });
  });

  it('warms an active create and only invalidates runtime on delete', async () => {
    mockCreateServer.mockResolvedValue(makeServer());

    await act(async () => {
      await actions?.createServer({ baseUrl: 'https://a.example/mcp', name: 'Server' });
    });

    expect(mockWarmToolsCache).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'server-1', isActive: true }),
    );
    expect(mockInvalidateServer).not.toHaveBeenCalled();

    jest.clearAllMocks();
    await act(async () => {
      await actions?.deleteServer('server-1');
    });

    expect(mockInvalidateServer).toHaveBeenCalledWith('server-1');
    expect(mockWarmToolsCache).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.mcpServers.tools('server-1'),
    });
  });

  it('does not keep a create mutation pending while the server warms', async () => {
    const warm = deferred<void>();
    mockWarmToolsCache.mockReturnValueOnce(warm.promise);
    mockCreateServer.mockResolvedValue(makeServer());

    await act(async () => {
      await actions?.createServer({ baseUrl: 'https://a.example/mcp', name: 'Server' });
    });

    expect(mockWarmToolsCache).toHaveBeenCalledTimes(1);
    warm.resolve();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
