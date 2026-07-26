import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { queryKeys } from '@/data/api';
import type { StreamableHttpMcpServer } from '@/data/types/mcpServer';

import { useMcpServerMutations } from '../useMcpServers';

const mockInvalidateQueries = jest.fn(async () => undefined);
const mockInvalidateServer = jest.fn();
const mockPrewarmActiveServers = jest.fn(async () => undefined);
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
      prewarmActiveServers: mockPrewarmActiveServers,
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
    expect(mockPrewarmActiveServers).not.toHaveBeenCalled();
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
    expect(mockPrewarmActiveServers).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.mcpServers.tools('server-1'),
    });
  });

  it('invalidates, refreshes tools, and prewarms after a transport change', async () => {
    mockGetServer.mockResolvedValue(makeServer());
    mockUpdateServer.mockResolvedValue(makeServer({ baseUrl: 'https://b.example/mcp' }));

    await act(async () => {
      await actions?.updateServer('server-1', { baseUrl: 'https://b.example/mcp' });
    });

    expect(mockInvalidateServer).toHaveBeenCalledWith('server-1');
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.mcpServers.tools('server-1'),
    });
    expect(mockPrewarmActiveServers).toHaveBeenCalledTimes(1);
  });

  it('prewarms on enable and invalidates on disable', async () => {
    mockGetServer.mockResolvedValueOnce(makeServer({ isActive: false }));
    mockUpdateServer.mockResolvedValueOnce(makeServer({ isActive: true }));

    await act(async () => {
      await actions?.updateServer('server-1', { isActive: true });
    });

    expect(mockPrewarmActiveServers).toHaveBeenCalledTimes(1);
    expect(mockInvalidateServer).not.toHaveBeenCalled();

    jest.clearAllMocks();
    mockGetServer.mockResolvedValueOnce(makeServer({ isActive: true }));
    mockUpdateServer.mockResolvedValueOnce(makeServer({ isActive: false }));

    await act(async () => {
      await actions?.updateServer('server-1', { isActive: false });
    });

    expect(mockInvalidateServer).toHaveBeenCalledWith('server-1');
    expect(mockPrewarmActiveServers).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.mcpServers.tools('server-1'),
    });
  });

  it('prewarms an active create and only invalidates runtime on delete', async () => {
    mockCreateServer.mockResolvedValue(makeServer());

    await act(async () => {
      await actions?.createServer({ baseUrl: 'https://a.example/mcp', name: 'Server' });
    });

    expect(mockPrewarmActiveServers).toHaveBeenCalledTimes(1);
    expect(mockInvalidateServer).not.toHaveBeenCalled();

    jest.clearAllMocks();
    await act(async () => {
      await actions?.deleteServer('server-1');
    });

    expect(mockInvalidateServer).toHaveBeenCalledWith('server-1');
    expect(mockPrewarmActiveServers).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.mcpServers.tools('server-1'),
    });
  });
});
