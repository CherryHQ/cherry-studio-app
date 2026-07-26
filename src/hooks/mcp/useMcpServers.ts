import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryKeys } from '@/data/api';
import type { CreateMcpServerDto, UpdateMcpServerDto } from '@/data/api/schemas/mcpServers';
import { useDataQuery } from '@/data/hooks';
import { useDataServices } from '@/data/runtime';
import type { StreamableHttpMcpServer } from '@/data/types/mcpServer';

const EMPTY_MCP_SERVERS: readonly StreamableHttpMcpServer[] = Object.freeze([]);

export function useMcpServersApi() {
  const query = useDataQuery({
    queryFn: (services) => services.mcpServer.list(),
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
    queryFn: (services) => services.mcpServer.getById(id ?? ''),
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

export function useMcpServerMutations() {
  const services = useDataServices();
  const queryClient = useQueryClient();

  const invalidateServerQueries = useCallback(
    async (serverId: string, includeTools = false) => {
      const invalidations = [
        queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers.all() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers.detail(serverId) }),
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
    mutationFn: (dto: CreateMcpServerDto) => services.mcpServer.create(dto),
    onSuccess: async (server) => {
      await Promise.all([
        invalidateServerQueries(server.id),
        ...(server.isActive ? [services.mcp.prewarmActiveServers()] : []),
      ]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateMcpServerDto }) => {
      if (!id) {
        throw new Error('updateMcpServer called with empty id');
      }

      const previous = hasRuntimeRelevantPatch(patch)
        ? await services.mcpServer.getById(id)
        : undefined;
      const server = await services.mcpServer.update(id, patch);
      return { previous, server };
    },
    onSuccess: async ({ previous, server }) => {
      const transportChanged = previous ? !hasSameTransport(previous, server) : false;
      const becameActive = previous ? !previous.isActive && server.isActive : false;
      const becameInactive = previous ? previous.isActive && !server.isActive : false;

      if (transportChanged || becameInactive) {
        services.mcp.invalidateServer(server.id);
      }

      await Promise.all([
        invalidateServerQueries(server.id, transportChanged),
        ...(server.isActive && (transportChanged || becameActive)
          ? [services.mcp.prewarmActiveServers()]
          : []),
      ]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => services.mcpServer.delete(id),
    onSuccess: async (_data, id) => {
      services.mcp.invalidateServer(id);
      // Junction rows are gone; assistants referencing this server changed too.
      await Promise.all([
        invalidateServerQueries(id),
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
