import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { McpServerRuntimeSummary } from '@/backend/infrastructure/ai/mcp';
import { useDataServices } from '@/bootstrap';
import { queryKeys } from '@/frontend/data';
import { useDataQuery } from '@/frontend/data/hooks';
import type { CreateMcpServerDto, UpdateMcpServerDto } from '@/shared/data/api/schemas/mcpServers';
import type { StreamableHttpMcpServer } from '@/shared/data/types/mcpServer';

const EMPTY_MCP_SERVERS: readonly StreamableHttpMcpServer[] = Object.freeze([]);
const EMPTY_MCP_RUNTIME_SUMMARIES: Readonly<Record<string, McpServerRuntimeSummary>> =
  Object.freeze({});

export function useMcpServersApi() {
  const query = useDataQuery({
    queryFn: (services) => services.mcpServer.list({ type: 'streamableHttp' }),
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
  const enabled = Boolean(id);
  const queryServerId = id ?? '__missing_mcp_server__';
  const query = useDataQuery({
    enabled,
    queryFn: (services) => services.mcpServer.getById(id ?? '', 'streamableHttp'),
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
  const query = useDataQuery({
    enabled: servers.length > 0,
    queryFn: (services) => services.mcp.getRuntimeSummaries(servers),
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
  const services = useDataServices();
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
    mutationFn: (dto: CreateMcpServerDto) => services.mcpServer.create(dto, 'streamableHttp'),
    onSuccess: async (server) => {
      queryClient.setQueryData(queryKeys.mcpServers.detail(server.id), server);
      await invalidateServerQueries(server.id, { refetchDetail: false });
      if (server.isActive) {
        void services.mcp.warmToolsCache(server);
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateMcpServerDto }) => {
      if (!id) {
        throw new Error('updateMcpServer called with empty id');
      }

      const previous = hasRuntimeRelevantPatch(patch)
        ? await services.mcpServer.getById(id, 'streamableHttp')
        : undefined;
      const server = await services.mcpServer.update(id, patch, 'streamableHttp');
      return { previous, server };
    },
    onSuccess: async ({ previous, server }) => {
      const transportChanged = previous ? !hasSameTransport(previous, server) : false;
      const becameActive = previous ? !previous.isActive && server.isActive : false;
      const becameInactive = previous ? previous.isActive && !server.isActive : false;

      if (transportChanged) {
        services.mcp.invalidateServer(server.id);
      } else if (becameInactive) {
        services.mcp.invalidateServer(server.id, { preserveSnapshot: true });
      }

      queryClient.setQueryData(queryKeys.mcpServers.detail(server.id), server);
      await invalidateServerQueries(server.id, {
        includeTools: transportChanged,
        refetchDetail: false,
      });
      if (server.isActive && (transportChanged || becameActive)) {
        void services.mcp.warmToolsCache(server);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => services.mcpServer.delete(id, 'streamableHttp'),
    onSuccess: (_data, id) => {
      services.mcp.invalidateServer(id);
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

function hasRuntimeRelevantPatch(patch: UpdateMcpServerDto): boolean {
  return patch.baseUrl !== undefined || patch.headers !== undefined || patch.isActive !== undefined;
}

function hasSameTransport(left: StreamableHttpMcpServer, right: StreamableHttpMcpServer): boolean {
  if (left.baseUrl !== right.baseUrl) {
    return false;
  }

  const leftHeaders = Object.entries(left.headers);
  return (
    leftHeaders.length === Object.keys(right.headers).length &&
    leftHeaders.every(([name, value]) => right.headers[name] === value)
  );
}
