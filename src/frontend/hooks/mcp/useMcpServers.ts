import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryKeys, useBackendModule } from '@/frontend/data';
import type { McpServerRuntimeSummary } from '@/shared/contracts';
import type { CreateMcpServerDto, UpdateMcpServerDto } from '@/shared/data/api/schemas/mcpServers';
import type { StreamableHttpMcpServer } from '@/shared/data/types/mcpServer';

const EMPTY_MCP_SERVERS: readonly StreamableHttpMcpServer[] = Object.freeze([]);
const EMPTY_MCP_RUNTIME_SUMMARIES: Readonly<Record<string, McpServerRuntimeSummary>> =
  Object.freeze({});

export function useMcpServersApi() {
  const mcp = useBackendModule('mcp');
  const query = useQuery({
    queryFn: () => mcp.listServers(),
    queryKey: queryKeys.mcpServers.list(),
  });

  return {
    servers: query.data?.items ?? EMPTY_MCP_SERVERS,
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    query,
  };
}

export function useMcpServerApiById(id: string | undefined) {
  const mcp = useBackendModule('mcp');
  const enabled = Boolean(id);
  const queryServerId = id ?? '__missing_mcp_server__';
  const query = useQuery({
    enabled,
    queryFn: () => mcp.getServer(id ?? ''),
    queryKey: queryKeys.mcpServers.detail(queryServerId),
  });

  return {
    server: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    query,
  };
}

export function useMcpServerRuntimeSummaries(servers: readonly StreamableHttpMcpServer[]) {
  const mcp = useBackendModule('mcp');
  const query = useQuery({
    enabled: servers.length > 0,
    queryFn: () => mcp.getRuntimeSummaries(servers),
    queryKey: queryKeys.mcpServers.runtimeSummaries(servers),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return {
    error: query.error,
    isLoading: query.isLoading,
    query,
    summaries: query.data ?? EMPTY_MCP_RUNTIME_SUMMARIES,
  };
}

export function useMcpServerMutations() {
  const mcp = useBackendModule('mcp');
  const queryClient = useQueryClient();

  const invalidateServerQueries = useCallback(
    async (serverId: string, options: { includeTools?: boolean; refetchDetail?: boolean } = {}) => {
      const { includeTools = false, refetchDetail = true } = options;
      const invalidations = [
        queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers.all() }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.mcpServers.detail(serverId),
          refetchType: refetchDetail ? 'active' : 'none',
        }),
      ];
      if (includeTools) {
        invalidations.push(
          queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers.tools(serverId) }),
        );
      }
      await Promise.all(invalidations);
    },
    [queryClient],
  );

  const createMutation = useMutation({
    mutationFn: (dto: CreateMcpServerDto) => mcp.createServer(dto),
    onSuccess: async (server) => {
      queryClient.setQueryData(queryKeys.mcpServers.detail(server.id), server);
      await invalidateServerQueries(server.id, { refetchDetail: false });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateMcpServerDto }) =>
      mcp.updateServer(id, patch),
    onSuccess: async ({ server, toolsChanged }) => {
      queryClient.setQueryData(queryKeys.mcpServers.detail(server.id), server);
      await invalidateServerQueries(server.id, {
        includeTools: toolsChanged,
        refetchDetail: false,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => mcp.removeServer(id),
    onSuccess: (_data, id) => {
      void Promise.allSettled([
        invalidateServerQueries(id, { refetchDetail: false }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assistants.all() }),
      ]);
    },
  });

  const createServer = useCallback(
    (dto: CreateMcpServerDto) => createMutation.mutateAsync(dto),
    [createMutation],
  );
  const updateServer = useCallback(
    async (id: string, patch: UpdateMcpServerDto) =>
      (await updateMutation.mutateAsync({ id, patch })).server,
    [updateMutation],
  );
  const deleteServer = useCallback(
    (id: string) => deleteMutation.mutateAsync(id),
    [deleteMutation],
  );

  return {
    createServer,
    updateServer,
    deleteServer,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
