import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { queryKeys } from '@/frontend/data';
import type { RemoteMcpServer } from '@/shared/data/types/mcpServer';

import { useMcpServerTools } from '../hooks/useMcpServerTools';

const mockListTools = jest.fn();
jest.mock('@/frontend/data', () => ({
  ...jest.requireActual('@/frontend/data'),
  useBackendModule: () => ({ listTools: mockListTools }),
}));

const server: RemoteMcpServer = {
  id: 'server-1',
  name: 'Server',
  endpointUrl: 'https://server.example/mcp',
  isEnabled: true,
  disabledTools: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

it('invalidates every summaries query on tools failure and successful retry', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const summaryKeys = [
    queryKeys.mcpServers.runtimeSummaries([server]),
    queryKeys.mcpServers.runtimeSummaries([{ ...server, id: 'server-2' }]),
  ];
  const seedSummaries = () => {
    for (const key of summaryKeys) client.setQueryData(key, { previous: true });
  };
  const expectStale = () => {
    for (const key of summaryKeys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  };
  const error = new Error('tool listing failed');
  mockListTools.mockRejectedValueOnce(error).mockResolvedValueOnce([]);
  seedSummaries();
  let query: ReturnType<typeof useMcpServerTools> | undefined;
  function Probe() {
    query = useMcpServerTools(server);
    return null;
  }
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(
        <QueryClientProvider client={client}>
          <Probe />
        </QueryClientProvider>,
      );
    });
    expect(client.getQueryState(queryKeys.mcpServers.tools(server.id))?.error).toBe(error);
    expectStale();
    seedSummaries();
    await act(async () => {
      const result = await query!.refetch();
      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual([]);
    });
    expectStale();
    expect(mockListTools).toHaveBeenCalledTimes(2);
    expect(mockListTools).toHaveBeenCalledWith(server.id);
  } finally {
    await act(async () => renderer?.unmount());
    client.clear();
  }
});
