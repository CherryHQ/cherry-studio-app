import type { DataServices } from '@/data/services/createDataServices';
import type { McpServer } from '@/data/types/mcpServer';
import { clearMcpToolAutoApproveRule } from '../mcpAutoApproveRule';

const serverWildcard = 'mcp__myServer__*';

function makeServer(disabledAutoApproveTools: string[]): McpServer {
  return {
    baseUrl: 'https://a.example/mcp',
    createdAt: '2026-01-01T00:00:00.000Z',
    description: '',
    disabledAutoApproveTools,
    disabledTools: [],
    headers: {},
    id: 'server-1',
    isActive: true,
    name: 'My Server',
    timeout: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createServices(server: McpServer) {
  const listToolsForServer = jest.fn(async () => [
    { name: 'search_docs' },
    { name: 'read_file' },
    { name: 'write_file' },
  ]);
  const update = jest.fn(async () => server);

  return {
    listToolsForServer,
    services: {
      mcp: { listToolsForServer },
      mcpServer: { getById: jest.fn(async () => server), update },
    } as unknown as Pick<DataServices, 'mcp' | 'mcpServer'>,
    update,
  };
}

describe('clearMcpToolAutoApproveRule', () => {
  test('drops the rule for one tool without touching the tool list', async () => {
    const { listToolsForServer, services, update } = createServices(
      makeServer(['search_docs', 'read_file']),
    );

    await clearMcpToolAutoApproveRule(services, {
      rawToolName: 'search_docs',
      serverId: 'server-1',
    });

    expect(listToolsForServer).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith('server-1', {
      disabledAutoApproveTools: ['read_file'],
    });
  });

  test('re-expands a server-wide rule over the tools it still has to cover', async () => {
    const { services, update } = createServices(makeServer([serverWildcard]));

    await clearMcpToolAutoApproveRule(services, {
      rawToolName: 'search_docs',
      serverId: 'server-1',
    });

    // Clearing the wildcard outright would auto-approve every other tool on
    // this server, which the user never asked for.
    expect(update).toHaveBeenCalledWith('server-1', {
      disabledAutoApproveTools: ['read_file', 'write_file'],
    });
  });

  test('lets a failed write surface so the caller can report it', async () => {
    const { services } = createServices(makeServer([]));
    (services.mcpServer.update as jest.Mock).mockRejectedValue(new Error('db is gone'));

    await expect(
      clearMcpToolAutoApproveRule(services, { rawToolName: 'search_docs', serverId: 'server-1' }),
    ).rejects.toThrow('db is gone');
  });
});
