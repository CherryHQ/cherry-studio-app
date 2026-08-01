import type { McpServerService } from '@/backend/data/services/McpServerService';
import type { McpServerMutations } from '@/backend/services/mcp/createMcpModule';

import { createMcpServerHandlers } from '../mcpServers';

describe('MCP server Data API handlers', () => {
  test('read through McpServerService and coordinate mutations through McpModule', async () => {
    const service = {
      getById: jest.fn(async () => ({ id: 'server-1' })),
      list: jest.fn(async () => ({ items: [], page: 1, total: 0 })),
    };
    const mutations = {
      createServer: jest.fn(async () => ({ id: 'server-1' })),
      removeServer: jest.fn(async () => undefined),
      updateServer: jest.fn(async () => ({ server: { id: 'server-1' }, toolsChanged: true })),
    };
    const handlers = createMcpServerHandlers(
      service as unknown as McpServerService,
      mutations as unknown as McpServerMutations,
    );

    await handlers['/mcp-servers'].GET({ query: { isActive: true } });
    await handlers['/mcp-servers'].POST({
      body: { baseUrl: 'https://example.com/mcp', name: 'Server' },
    });
    await handlers['/mcp-servers/:id'].GET({ params: { id: 'server-1' } });
    await handlers['/mcp-servers/:id'].PATCH({
      body: { baseUrl: 'https://example.com/next' },
      params: { id: 'server-1' },
    });
    await handlers['/mcp-servers/:id'].DELETE({ params: { id: 'server-1' } });

    expect(service.list).toHaveBeenCalledWith({ isActive: true, type: 'streamableHttp' });
    expect(service.getById).toHaveBeenCalledWith('server-1', 'streamableHttp');
    expect(mutations.createServer).toHaveBeenCalledWith({
      baseUrl: 'https://example.com/mcp',
      name: 'Server',
    });
    expect(mutations.updateServer).toHaveBeenCalledWith('server-1', {
      baseUrl: 'https://example.com/next',
    });
    expect(mutations.removeServer).toHaveBeenCalledWith('server-1');
  });
});
